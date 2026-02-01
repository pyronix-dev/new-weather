// Developed by Omar Rafik (OMX) - omx001@proton.me
import { NextResponse } from "next/server"
import JSZip from "jszip"

const METEO_FRANCE_API_KEY = process.env.METEO_FRANCE_API_KEY
const METEO_FRANCE_APPLICATION_ID = process.env.METEO_FRANCE_APPLICATION_ID
const TOKEN_URL = "https://portail-api.meteofrance.fr/token"

const COLOR_ID_MAP: Record<number, string> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
  5: "violet",
}

const MAP_URLS: Record<string, string> = {
  gris: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/map_gris.png",
  vert: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/map_vert.png",
  jaune: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/map_jaune.png",
  orange: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/map_orange.png",
  rouge: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/map_rouge.png",
  violet: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/map_violet.png",
  erreur: "https://raw.githubusercontent.com/pyronix-dev/mqweather/main/public/maps/error.png",
}

const PHENOMENON_MAP: Record<number, string> = {
  1: "vent",
  2: "pluie-inondation",
  3: "orages",
  4: "crues",
  5: "neige-verglas",
  6: "grand-froid",
  7: "canicule",
  8: "avalanches",
  9: "vagues-submersion",
  10: "cyclone",
}

let cachedToken: string | null = null
let tokenExpiration: number = 0

async function getOAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiration - 60000) return cachedToken
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${METEO_FRANCE_APPLICATION_ID}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!response.ok) return null
    const data = await response.json()
    cachedToken = data.access_token
    tokenExpiration = Date.now() + (data.expires_in * 1000)
    return cachedToken
  } catch (error) {
    return null
  }
}

async function tryFetchWithToken(endpoint: string, token: string): Promise<Response | null> {
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "*/*", Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    return response.ok ? response : null
  } catch {
    return null
  }
}

async function processResponse(response: Response) {
  const arrayBuffer = await response.arrayBuffer()
  const zip = new JSZip()
  const zipContents = await zip.loadAsync(arrayBuffer)
  const jsonFileName = Object.keys(zipContents.files).find(f => f.endsWith(".json"))

  if (jsonFileName) {
    const content = await zipContents.files[jsonFileName].async("string")
    const data = JSON.parse(content)
    const domain = data.timelaps.domain_ids.find((d: any) => d.domain_id === "VIGI972")
    
    if (domain) {
      const phenomena = domain.phenomenon_items
        .filter((p: any) => p.phenomenon_max_color_id > 1)
        .map((p: any) => PHENOMENON_MAP[p.phenomenon_id] || "alerte")
      const colorName = COLOR_ID_MAP[domain.max_color_id] || "vert"
      return {
        colorId: domain.max_color_id,
        colorName,
        mapUrl: MAP_URLS[colorName],
        lastUpdate: new Date().toISOString(),
        phenomena,
        source: "JSON_GLOBAL"
      }
    }
  }
  throw new Error("Could not parse data from provider")
}

export async function GET() {
  try {
    let response: Response | null = null
    const endpoint = "https://public-api.meteofrance.fr/public/DPVigilance/v1/vigilanceom/flux/dernier"
    if (METEO_FRANCE_API_KEY) response = await tryFetchWithToken(endpoint, METEO_FRANCE_API_KEY)
    if (!response) {
      const token = await getOAuthToken()
      if (token) response = await tryFetchWithToken(endpoint, token)
    }
    if (response) {
      const data = await processResponse(response)
      return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=300" } })
    }
    throw new Error("No response from Météo France")
  } catch (error) {
    return NextResponse.json({
      colorId: -1,
      colorName: "erreur",
      mapUrl: MAP_URLS.erreur,
      lastUpdate: new Date().toISOString(),
      phenomena: [],
    })
  }
}