import uuid
import asyncio
from typing import Dict, Set

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Dict] = {}
        self.room_websockets: Dict[str, Set] = {}
    
    

    def create_room(self, user_id: str) -> str:
        room_code = str(uuid.uuid4())[:8]
        self.rooms[room_code] = {
            "creator": user_id,
            "participants": {user_id},
            "created_at": asyncio.get_event_loop().time(),
            "transcript": ""
        }
        self.room_websockets[room_code] = set()
        print(f"✅ Room created: {room_code} by {user_id}")
        return room_code

    def join_room(self, room_code: str, user_id: str) -> bool:
        if room_code in self.rooms:
            self.rooms[room_code]["participants"].add(user_id)
            print(f"👥 {user_id} joined room {room_code}")
            return True
        print(f"❌ Room not found: {room_code}")
        return False

    def room_exists(self, room_code: str) -> bool:
        return room_code in self.rooms


    
    def leave_room(self, room_code: str, user_id: str):
        if room_code in self.rooms:
            self.rooms[room_code]["participants"].discard(user_id)
            if user_id == self.rooms[room_code]["creator"]:
                self.delete_room(room_code)
            elif not self.rooms[room_code]["participants"]:
                self.delete_room(room_code)
    
    def delete_room(self, room_code: str):
        if room_code in self.rooms:
            del self.rooms[room_code]
        if room_code in self.room_websockets:
            del self.room_websockets[room_code]
    
    def room_exists(self, room_code: str) -> bool:
        return room_code in self.rooms
    
    def add_transcript(self, room_code: str, text: str):
        if room_code in self.rooms:
            self.rooms[room_code]["transcript"] += text + "\n"
    
    def get_transcript(self, room_code: str) -> str:
        return self.rooms.get(room_code, {}).get("transcript", "")
    
    def add_websocket(self, room_code: str, websocket):
        if room_code not in self.room_websockets:
            self.room_websockets[room_code] = set()
        self.room_websockets[room_code].add(websocket)
    
    def remove_websocket(self, room_code: str, websocket):
        if room_code in self.room_websockets:
            self.room_websockets[room_code].discard(websocket)
    
    def broadcast_to_room(self, room_code: str, message: str):
        if room_code in self.room_websockets:
            for websocket in self.room_websockets[room_code]:
                asyncio.create_task(websocket.send_text(message))

room_manager = RoomManager()