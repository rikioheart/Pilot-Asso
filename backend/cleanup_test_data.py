import asyncio, os
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    rx = {"$regex": "TEST_", "$options": "i"}
    for coll, field in [("stock_items", "name"), ("stock_categories", "name"),
                        ("stock_movements", "item_name"), ("documents", "title"),
                        ("document_categories", "label"), ("guides", "title"),
                        ("pro_reviews", "observations"), ("taxonomies", "label"),
                        ("terrains", "name"), ("activities", "title"), ("events", "title"),
                        ("partners", "name"), ("advantages", "title")]:
        res = await db[coll].delete_many({field: rx})
        if res.deleted_count:
            print(coll, res.deleted_count)

asyncio.run(main())
