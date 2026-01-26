// Developed by Omar Rafik (OMX) - omx001@proton.me
import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sendContactMessageEmail } from '@/lib/brevo'
import { headers } from 'next/headers'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, email, subject, message } = body

        if (!name || !email || !message) {
            return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
        }

        // 1. Get IP Address
        const headersList = await headers()
        const forwardedFor = headersList.get('x-forwarded-for')
        const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown'

        // 2. Rate Limiting (1 message per IP per 24 hours)
        const supabase = createSupabaseAdmin()
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data: existingMessages, error: checkError } = await supabase
            .from('contact_messages')
            .select('id')
            .eq('ip_address', ip)
            .gt('created_at', oneDayAgo)
            .limit(1)

        if (checkError && checkError.code !== '42P01') { // Ignore "relation does not exist" if table missing, but user should run migration
            console.error('Rate limit check error:', checkError)
        }

        if (existingMessages && existingMessages.length > 0) {
            return NextResponse.json(
                { error: 'Limite atteinte. Vous ne pouvez envoyer qu\'un message par jour.' },
                { status: 429 }
            )
        }

        // 3. Save Message to DB
        const { error: insertError } = await supabase
            .from('contact_messages')
            .insert({
                ip_address: ip,
                name,
                email,
                subject,
                message
            })

        if (insertError) {
            console.error('Failed to save contact message:', insertError)
            // Continue explicitly even if DB fails? No, better to fail to avoid spam if DB is down but email works (or vice versa)
            // Actually, let's allow it to proceed if it's just a DB error so admins still get email? 
            // Better to be strict: if DB fails, rate limit won't work next time.
            return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
        }

        // 4. Fetch Admins
        const { data: admins, error: adminsError } = await supabase
            .from('users')
            .select('email')
            .in('role', ['admin', 'super_admin'])

        if (adminsError) {
            console.error('Failed to fetch admins:', adminsError)
        }

        // 5. Send Emails
        if (admins && admins.length > 0) {
            const emailPromises = admins
                .filter(admin => admin.email) // Ensure email exists
                .map(admin => sendContactMessageEmail(admin.email!, name, email, subject, message))

            await Promise.allSettled(emailPromises)
        } else {
            console.warn('No admins found to send contact email to.')
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Contact API Error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
