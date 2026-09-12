"""Helper: backdate a user to trigger relance banner. Usage: python backdate_user.py <email>"""
import sys, os, asyncio
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient

async def main(email):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    created = (now - timedelta(days=90)).isoformat()
    last = (now - timedelta(days=30)).isoformat()
    res = await db.users.update_one({"email": email.lower()},
        {"$set": {"created_at": created, "last_login": last},
         "$unset": {"relance_shown_at": ""}})
    print("matched", res.matched_count, "modified", res.modified_count)

if __name__ == "__main__":
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "test_database")
    asyncio.run(main(sys.argv[1]))
