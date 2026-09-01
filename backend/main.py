from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect
)

from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, get_db, SessionLocal
from models import User, Message


app = FastAPI(
    title="Chat With Me API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://chatwithme01-8pe8.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================
# CREATE DATABASE TABLES
# =====================================

Base.metadata.create_all(bind=engine)


# =====================================
# PASSWORD HASHING
# =====================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


# =====================================
# REQUEST MODELS
# =====================================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MessageRequest(BaseModel):
    sender_id: int
    receiver_id: int
    message: str


# =====================================
# WEBSOCKET CONNECTION MANAGER
# =====================================

class ConnectionManager:

    def __init__(self):
        # {user_id: WebSocket}
        self.active_connections = {}

    async def connect(
        self,
        user_id: int,
        websocket: WebSocket
    ):
        await websocket.accept()

        self.active_connections[user_id] = websocket

        print(f"User {user_id} connected")


    def disconnect(
        self,
        user_id: int
    ):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

        print(f"User {user_id} disconnected")


    async def send_personal_message(
        self,
        message: dict,
        user_id: int
    ):
        if user_id in self.active_connections:

            await self.active_connections[user_id].send_json(
                message
            )


manager = ConnectionManager()


# =====================================
# BASIC API
# =====================================

@app.get("/")
def home():

    return {
        "message": "Chat With Me API is running"
    }


# =====================================
# REGISTER USER
# =====================================

@app.post("/register")
def register_user(
    user: RegisterRequest,
    db: Session = Depends(get_db)
):

    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )

    hashed_password = pwd_context.hash(
        user.password
    )

    new_user = User(
        email=user.email,
        password=hashed_password
    )

    db.add(new_user)

    db.commit()

    db.refresh(new_user)

    return {
        "message": "User registered successfully",
        "user_id": new_user.id,
        "email": new_user.email
    }


# =====================================
# LOGIN USER
# =====================================

@app.post("/login")
def login_user(
    user: LoginRequest,
    db: Session = Depends(get_db)
):

    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if not existing_user:

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    password_correct = pwd_context.verify(
        user.password,
        existing_user.password
    )

    if not password_correct:

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    return {
        "message": "Login successful",
        "user_id": existing_user.id,
        "email": existing_user.email
    }


# =====================================
# SEND MESSAGE - REST API
# =====================================

@app.post("/messages")
def send_message(
    message: MessageRequest,
    db: Session = Depends(get_db)
):

    sender = db.query(User).filter(
        User.id == message.sender_id
    ).first()

    receiver = db.query(User).filter(
        User.id == message.receiver_id
    ).first()

    if not sender or not receiver:

        raise HTTPException(
            status_code=404,
            detail="Sender or receiver not found"
        )

    if not message.message.strip():

        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    new_message = Message(
        sender_id=message.sender_id,
        receiver_id=message.receiver_id,
        message=message.message.strip()
    )

    db.add(new_message)

    db.commit()

    db.refresh(new_message)

    return {
        "message": "Message sent successfully",
        "data": {
            "id": new_message.id,
            "sender_id": new_message.sender_id,
            "receiver_id": new_message.receiver_id,
            "message": new_message.message,
            "created_at": str(
                new_message.created_at
            )
        }
    }


# =====================================
# GET CHAT HISTORY
# =====================================

@app.get("/messages/{user1_id}/{user2_id}")
def get_messages(
    user1_id: int,
    user2_id: int,
    db: Session = Depends(get_db)
):

    messages = db.query(Message).filter(
        (
            (Message.sender_id == user1_id) &
            (Message.receiver_id == user2_id)
        )
        |
        (
            (Message.sender_id == user2_id) &
            (Message.receiver_id == user1_id)
        )
    ).order_by(
        Message.created_at.asc()
    ).all()

    return messages


# =====================================
# REAL-TIME WEBSOCKET CHAT
# =====================================

@app.websocket("/ws/{user_id}")
async def websocket_chat(
    websocket: WebSocket,
    user_id: int
):

    await manager.connect(
        user_id,
        websocket
    )

    db = SessionLocal()

    try:

        while True:

            data = await websocket.receive_json()

            receiver_id = data.get(
                "receiver_id"
            )

            message_text = data.get(
                "message",
                ""
            ).strip()


            # Validate message
            if not receiver_id:

                await websocket.send_json({
                    "type": "error",
                    "message": "Receiver ID is required"
                })

                continue


            if not message_text:

                await websocket.send_json({
                    "type": "error",
                    "message": "Message cannot be empty"
                })

                continue


            # Validate receiver exists
            receiver = db.query(User).filter(
                User.id == receiver_id
            ).first()

            if not receiver:

                await websocket.send_json({
                    "type": "error",
                    "message": "Receiver not found"
                })

                continue


            # Save message in SQL database
            new_message = Message(
                sender_id=user_id,
                receiver_id=receiver_id,
                message=message_text
            )

            db.add(new_message)

            db.commit()

            db.refresh(new_message)


            # Prepare response
            message_data = {
                "type": "message",
                "id": new_message.id,
                "sender_id": user_id,
                "receiver_id": receiver_id,
                "message": message_text,
                "created_at": str(
                    new_message.created_at
                )
            }


            # Send to receiver in real time
            await manager.send_personal_message(
                message_data,
                receiver_id
            )


            # Send confirmation back to sender
            await manager.send_personal_message(
                message_data,
                user_id
            )


    except WebSocketDisconnect:

        manager.disconnect(
            user_id
        )


    except Exception as error:

        print(
            f"WebSocket error: {error}"
        )

        manager.disconnect(
            user_id
        )


    finally:

        db.close()