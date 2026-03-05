import httpx


class DataService:
    _cache: list[dict] | None = None

    @classmethod
    async def load(cls, supabase_url: str, supabase_key: str) -> list[dict]:
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
        }
        select = "date,session,gender,format,nat,start_no,name,run,status,start_time,int1,int2,int3,int4,finish,speed"

        all_rows = []
        offset = 0
        limit = 1000

        async with httpx.AsyncClient() as client:
            while True:
                resp = await client.get(
                    f"{supabase_url}/rest/v1/skeleton_records",
                    params={"select": select, "order": "id", "offset": offset, "limit": limit},
                    headers=headers,
                )
                resp.raise_for_status()
                rows = resp.json()
                all_rows.extend(rows)
                if len(rows) < limit:
                    break
                offset += limit

        cls._cache = all_rows
        return all_rows

    @classmethod
    def get_records(cls) -> list[dict]:
        if cls._cache is None:
            raise RuntimeError("Data not loaded. Call load() first.")
        return cls._cache
