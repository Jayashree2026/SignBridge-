import datetime
from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect,Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import json
import asyncio
from room_manager import room_manager
from gestures import GestureRecognizer
import base64
import cv2
import numpy as np
from database import db_manager
from ai_analyzer import analyze_transcript, is_available
from dotenv import load_dotenv
import os



# Load environment variables
load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gesture_recognizer = GestureRecognizer()

@app.get("/")
async def read_root():
    return {"message": "SignBridge Backend API"}

@app.post("/create-room/{user_id}")
async def create_room(user_id: str):
    room_code = room_manager.create_room(user_id)
    return {"room_code": room_code}


@app.post("/join-room/{room_code}")
async def join_room(room_code: str, data: dict = Body(...)):
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id")
    if not room_manager.join_room(room_code, user_id):
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": f"{user_id} joined room {room_code}"}


@app.websocket("/ws/{room_code}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, user_id: str):
    await websocket.accept()
    room_manager.add_websocket(room_code, websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            data_json = json.loads(data)
            
            if data_json["type"] == "transcript":
                room_manager.add_transcript(room_code, data_json["text"])
                # Broadcast to all participants in the room
                room_manager.broadcast_to_room(room_code, json.dumps({
                    "type": "transcript_update",
                    "text": data_json["text"]
                }))
            
            elif data_json["type"] == "gesture_video":
                # Process gesture recognition
                image_data = data_json["image"].split(",")[1]
                image_bytes = base64.b64decode(image_data)
                np_arr = np.frombuffer(image_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                processed_frame, gesture_text = gesture_recognizer.recognize_gesture(frame)
                
                # ✅ Send only when text changes
                if gesture_text and gesture_text != gesture_recognizer.last_sent_text:
                    room_manager.add_transcript(room_code, gesture_text)
                    room_manager.broadcast_to_room(room_code, json.dumps({
                        "type": "transcript_update",
                        "text": gesture_text
                    }))
                    gesture_recognizer.last_sent_text = gesture_text
                            
                # Encode processed frame to send back (optional)
                _, buffer = cv2.imencode('.jpg', processed_frame)
                processed_image_data = base64.b64encode(buffer).decode('utf-8')
                
                await websocket.send_text(json.dumps({
                    "type": "processed_video",
                    "image": f"data:image/jpeg;base64,{processed_image_data}"
                }))
    
    except WebSocketDisconnect:
        room_manager.remove_websocket(room_code, websocket)
        room_manager.leave_room(room_code, user_id)

@app.get("/transcript/{room_code}")
async def get_transcript(room_code: str):
    transcript = room_manager.get_transcript(room_code)
    return {"transcript": transcript}

#rec
@app.get("/records/{room_code}")
async def get_records_by_room(room_code: str):
    """Fetch all records for a given room code"""
    if not db_manager.is_connected():
        raise HTTPException(status_code=500, detail="Database not connected")
    try:
        records = db_manager.get_records_by_room(room_code)
        for r in records:
            r["_id"] = str(r["_id"])
        return {"records": records}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching records: {str(e)}")

@app.get("/meeting-summary")
async def meeting_summary():
    try:
        meetings = db_manager.get_meeting_summary()
        return {"meetings": meetings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching meeting summary: {str(e)}")

@app.get("/records")
async def get_records(limit: int = 50):
    """Get all records from database"""
    if not db_manager.is_connected():
        raise HTTPException(status_code=500, detail="Database not connected")
    
    try:
        records = db_manager.get_records(limit)
        # Convert ObjectId to string for JSON serialization
        for record in records:
            record["_id"] = str(record["_id"])
        return {"records": records}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving records: {str(e)}")

@app.post("/save-room-info")
async def save_room_info(info: dict):
    """Store room metadata like purpose for the meeting."""
    if not db_manager.is_connected():
        raise HTTPException(status_code=500, detail="Database not connected")

    room_code = info.get("roomCode")
    purpose = info.get("purpose", "General")

    if not room_code:
        raise HTTPException(status_code=400, detail="Missing room code")

    try:
        db_manager.save_room_info(room_code, purpose)
        return {"status": "success", "message": "Room info saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save-record")
async def save_record(record_data: dict):
    """Save a record to database (accepts optional userId)"""
    if not db_manager.is_connected():
        raise HTTPException(status_code=500, detail="Database not connected")
    
    try:
        # Validate required fields
        if not all(key in record_data for key in ['name', 'content', 'roomCode']):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # userId is optional but recommended
        user_id = record_data.get('userId', None)
        record_id = db_manager.save_record(record_data)
        return {
            "status": "success", 
            "record_id": str(record_id),
            "userId": user_id,
            "message": "Record saved successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save record: {str(e)}")

@app.get("/records/user/{user_id}")
async def get_records_by_user(user_id: str, limit: int = 100):
    """Fetch records for a given userId"""
    if not db_manager.is_connected():
        raise HTTPException(status_code=500, detail="Database not connected")
    try:
        # Query by userId
        records = list(db_manager.records.find({"userId": user_id}).sort("timestamp", -1).limit(limit))
        for r in records:
            r["_id"] = str(r["_id"])
        return {"records": records}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching records for user {user_id}: {str(e)}")

    
@app.get("/record/{record_id}")
async def get_record(record_id: str):
    """Get a specific record by ID"""
    if not db_manager.is_connected():
        raise HTTPException(status_code=500, detail="Database not connected")
    
    try:
        record = db_manager.get_record_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Convert ObjectId to string for JSON serialization
        record["_id"] = str(record["_id"])
        return {"record": record}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving record: {str(e)}")



@app.post("/analyze-record/{record_id}")
async def analyze_record(
    record_id: str,
    analysis_type: str = "summary",
    custom_prompt: str = Query("", description="Custom prompt if analysis_type is custom")
):
    record = db_manager.get_record_by_id(record_id)
    if not record:
        return {"status": "error", "message": "Record not found"}
    
    analysis = analyze_transcript(record["content"], analysis_type)

    
    # Save analysis to database
    analysis_id = db_manager.save_analysis(record_id, analysis)
    
    return {
        "status": "success", 
        "analysis": analysis,
        "analysis_id": str(analysis_id)
    }

@app.get("/record-analyses/{record_id}")
async def get_record_analyses(record_id: str):
    analyses = db_manager.get_analyses_for_record(record_id)
    # Convert ObjectId to string for JSON serialization
    for analysis in analyses:
        analysis["_id"] = str(analysis["_id"])
    return {"analyses": analyses}

# if __name__ == "__main__":
#     uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host=host, port=port)