from dotenv import load_dotenv
load_dotenv()

from pymongo import MongoClient
from datetime import datetime
import os
from bson.objectid import ObjectId

class DatabaseManager:
    def __init__(self):
        # For MongoDB Atlas, use the connection string from your dashboard
        mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
        
        print(f"Attempting to connect to MongoDB with URI: {mongodb_uri.split('@')[-1] if '@' in mongodb_uri else mongodb_uri}")
        
        try:
            # Enhanced connection options for MongoDB Atlas
            connection_options = {
                'serverSelectionTimeoutMS': 30000,  # Increased to 30 seconds
                'connectTimeoutMS': 30000,
                'socketTimeoutMS': 30000,
                'retryWrites': True,
                'w': 'majority',
                'tls': True,  # Use 'tls' instead of 'ssl'
                'tlsAllowInvalidCertificates': True,  # Correct parameter name
            }
            
            # For MongoDB Atlas, you need to specify the database name in the connection string
            if "mongodb+srv://" in mongodb_uri:
                # Use the same approach as your test.py
                self.client = MongoClient(mongodb_uri, **connection_options)
                
                # Extract database name from URI - your URI shows it's in the connection string
                # mongodb+srv://Signbridge:signbridge21@cluster2.w78sf8d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster2
                # Let's parse it properly
                if "mongodb+srv://" in mongodb_uri:
                    # The database name should be specified in the connection string
                    # If not, we'll use 'signbridge' as default
                    if "/" in mongodb_uri.split("@")[-1]:
                        db_name = mongodb_uri.split("@")[-1].split("/")[1].split("?")[0]
                        if db_name:  # Only use if database name is not empty
                            self.db = self.client[db_name]
                            print(f"✅ Using database: {db_name}")
                        else:
                            self.db = self.client["signbridge"]
                            print("✅ Using default database: signbridge")
                    else:
                        self.db = self.client["signbridge"]
                        print("✅ Using default database: signbridge")
                else:
                    self.db = self.client["signbridge"]
                    print("✅ Using default database: signbridge")
            else:
                # Local MongoDB - no TLS required
                local_options = connection_options.copy()
                local_options.pop('tls', None)
                local_options.pop('tlsAllowInvalidCertificates', None)
                self.client = MongoClient(mongodb_uri, **local_options)
                self.db = self.client["signbridge"]
                print("✅ Using local database: signbridge")
            
            # Test the connection with a simple command
            print("🔄 Testing MongoDB connection...")
            self.client.admin.command('ping')
            print("✅ MongoDB connection established successfully!")

            # Initialize collections
            self.records = self.db["records"]
            self.analyses = self.db["analyses"]
            
            # Create indexes for better performance
            self.records.create_index("userId")
            self.records.create_index([("userId", 1), ("timestamp", -1)])
            self.records.create_index("timestamp")
            self.records.create_index("roomCode")
            self.records.create_index("type")

            self.analyses.create_index("record_id")
            self.analyses.create_index("timestamp")
            
            print("✅ Database collections and indexes initialized!")
            
        except Exception as e:
            print(f"❌ MongoDB connection failed: {e}")
            # Don't raise immediately, try to continue with limited functionality
            self.client = None
            self.db = None
    
    def is_connected(self):
        """Check if the database is connected"""
        if self.client is None:
            return False
        try:
            self.client.admin.command('ping')
            return True
        except:
            return False


    
    def save_record(self, record_data):
        """Save a communication record to database"""
        record = {
            "name": record_data.get("name"),
            "content": record_data.get("content"),
            "timestamp": datetime.now(),
            "roomCode": record_data.get("roomCode"),
            "type": record_data.get("type", "transcript"),
            # Accept optional userId (string). Keep backward compat if missing.
            "userId": record_data.get("userId", None)
        }
        result = self.records.insert_one(record)
        print(f"✅ Record saved with ID: {result.inserted_id} (userId: {record['userId']})")
        return result.inserted_id

    
    def get_records(self, limit=50):
        """Retrieve recent records"""
        records = list(self.records.find().sort("timestamp", -1).limit(limit))
        print(f"✅ Retrieved {len(records)} records from database")
        return records
    
    def get_records_by_room(self, room_code):
        """Fetch all records tied to a room code"""
        try:
            records = list(self.records.find({"roomCode": room_code}).sort("timestamp", -1))
            print(f"✅ Retrieved {len(records)} records for room {room_code}")
            return records
        except Exception as e:
            print(f"❌ Error fetching records for {room_code}: {e}")
            return []

    def delete_room_records(self, room_code):
        result = self.records.delete_many({"roomCode": room_code})
        print(f"🗑️ Deleted {result.deleted_count} records for room {room_code}")
        return result.deleted_count
    
    def save_room_info(self, room_code, purpose):
        """Ensure at least one record exists to store the purpose"""
        # Check if room already exists
        existing = self.records.find_one({"roomCode": room_code})
        if existing:
            self.records.update_many({"roomCode": room_code}, {"$set": {"purpose": purpose}})
            print(f"📝 Updated purpose for room {room_code}: {purpose}")
        else:
            # Create placeholder entry
            self.records.insert_one({
                "name": f"init-{room_code}",
                "content": "",
                "roomCode": room_code,
                "purpose": purpose,
                "timestamp": datetime.now(),
                "type": "info"
            })
            print(f"✅ Created initial record for room {room_code} with purpose: {purpose}")


    def get_meeting_summary(self):
        """Return one entry per roomCode with latest date and purpose"""
        try:
            pipeline = [
                {"$sort": {"timestamp": -1}},
                {
                    "$group": {
                        "_id": "$roomCode",
                        "latest": {"$first": "$timestamp"},
                        "purpose": {"$first": "$type"}
                    }
                },
                {"$sort": {"latest": -1}}
            ]
            results = list(self.records.aggregate(pipeline))
            return [{"roomCode": r["_id"], "date": r["latest"], "purpose": r["purpose"]} for r in results]
        except Exception as e:
            print(f"❌ Error in meeting summary: {e}")
            return []

    
    def get_record_by_id(self, record_id):
        """Get a specific record by ID"""
        try:
            record = self.records.find_one({"_id": ObjectId(record_id)})
            if record:
                print(f"✅ Record found with ID: {record_id}")
            else:
                print(f"⚠️ Record not found with ID: {record_id}")
            return record
        except Exception as e:
            print(f"❌ Error retrieving record {record_id}: {e}")
            return None
    
    def save_analysis(self, record_id, analysis_text, model_used="gemini"):
        """Save AI analysis of a record"""
        try:
            analysis = {
                "record_id": ObjectId(record_id),
                "analysis": analysis_text,
                "model_used": model_used,
                "timestamp": datetime.now()
            }
            result = self.analyses.insert_one(analysis)
            print(f"✅ Analysis saved for record {record_id} with ID: {result.inserted_id}")
            return result.inserted_id
        except Exception as e:
            print(f"❌ Error saving analysis for record {record_id}: {e}")
            return None
    
    def get_analyses_for_record(self, record_id):
        """Get all analyses for a specific record"""
        try:
            analyses = list(self.analyses.find({"record_id": ObjectId(record_id)}).sort("timestamp", -1))
            print(f"✅ Retrieved {len(analyses)} analyses for record {record_id}")
            return analyses
        except Exception as e:
            print(f"❌ Error retrieving analyses for record {record_id}: {e}")
            return []

# Singleton instance
db_manager = DatabaseManager()