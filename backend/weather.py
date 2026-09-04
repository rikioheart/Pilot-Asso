"""Prompt 8C — Météo à la demande via OpenWeatherMap.

La clé API est saisie par le Bureau dans les paramètres de l'association
(collection association_settings, clé « weather »). Tant qu'aucune clé n'est
enregistrée, l'endpoint renvoie {"configured": false} et l'interface affiche
« Météo non configurée ».
"""
from collections import OrderedDict

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from deps import db, active_user, require_admin, log_action
from settings_api import get_setting, set_setting

router = APIRouter(prefix="/api")

GEO_URL = "https://api.openweathermap.org/geo/1.0/direct"
FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"


class WeatherKeyIn(BaseModel):
    api_key: str = Field(min_length=8)


async def _weather_key() -> str:
    doc = await get_setting("weather", {})
    return (doc.get("api_key") or "").strip()


@router.get("/settings/weather")
async def weather_settings(admin: dict = Depends(require_admin)):
    key = await _weather_key()
    return {"configured": bool(key), "masked": ("•••• " + key[-4:]) if key else None}


@router.put("/settings/weather")
async def set_weather_key(payload: WeatherKeyIn, admin: dict = Depends(require_admin)):
    await set_setting("weather", {"api_key": payload.api_key.strip()}, admin)
    return {"configured": True}


@router.delete("/settings/weather")
async def clear_weather_key(admin: dict = Depends(require_admin)):
    await db.association_settings.delete_one({"key": "weather"})
    await log_action(admin, "UPDATE", "settings", "weather", new_value={"configured": False})
    return {"configured": False}


@router.get("/weather")
async def weather(location: str = Query(..., min_length=2), user: dict = Depends(active_user)):
    key = await _weather_key()
    if not key:
        return {"configured": False}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            geo = await client.get(GEO_URL, params={"q": location, "limit": 1, "appid": key})
            geo.raise_for_status()
            arr = geo.json()
            if not arr:
                return {"configured": True, "found": False, "location": location}
            lat, lon = arr[0]["lat"], arr[0]["lon"]
            name = arr[0].get("name") or location
            fc = await client.get(FORECAST_URL, params={"lat": lat, "lon": lon, "appid": key,
                                                         "units": "metric", "lang": "fr"})
            fc.raise_for_status()
            data = fc.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            raise HTTPException(status_code=502,
                                detail="Clé météo invalide ou pas encore active (jusqu'à ~1 h après création).")
        raise HTTPException(status_code=502, detail="Service météo indisponible pour le moment.")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Service météo indisponible pour le moment.")

    days = OrderedDict()
    for entry in data.get("list", []):
        day = entry["dt_txt"][:10]
        hour = entry["dt_txt"][11:13]
        bucket = days.setdefault(day, {"temps": [], "midday": None})
        bucket["temps"].append(entry["main"]["temp"])
        if hour == "12" and not bucket["midday"]:
            w = entry["weather"][0]
            bucket["midday"] = {"icon": w["icon"], "desc": w["description"]}
    out = []
    for day, bucket in list(days.items())[:3]:
        mid = bucket["midday"] or {}
        out.append({"date": day, "temp_min": round(min(bucket["temps"])),
                    "temp_max": round(max(bucket["temps"])),
                    "description": mid.get("desc") or "", "icon": mid.get("icon") or "01d"})
    return {"configured": True, "found": True, "location": name, "days": out}
