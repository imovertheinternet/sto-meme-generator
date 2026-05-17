import os
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/memes.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Meme(Base):
    __tablename__ = "memes"

    id = Column(String, primary_key=True)  # sha256 of source_url
    source = Column(String, nullable=False)  # instagram | tiktok | reddit | manual
    source_url = Column(String, unique=True)
    image_url = Column(String)
    video_url = Column(String, nullable=True)
    is_video = Column(Boolean, default=False)
    caption = Column(Text, nullable=True)
    hashtags = Column(Text, nullable=True)  # JSON array string
    likes = Column(Integer, default=0)
    platform_id = Column(String, nullable=True)  # native post id for dedup

    # AI scoring
    ai_score = Column(Float, nullable=True)  # 0-10 composite
    ai_humor_score = Column(Float, nullable=True)
    ai_patch_score = Column(Float, nullable=True)  # patch translatability
    ai_originality_score = Column(Float, nullable=True)
    ai_legal_flag = Column(Boolean, default=False)
    ai_reasoning = Column(Text, nullable=True)

    # User decision
    status = Column(String, default="pending")  # pending | approved | rejected | saved
    user_notes = Column(Text, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    local_image_path = Column(String, nullable=True)

    fetched_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=True)  # original post date


class SeenID(Base):
    """Deduplication table — never surface the same post twice."""

    __tablename__ = "seen_ids"

    platform_id = Column(String, primary_key=True)
    source = Column(String, nullable=False)
    seen_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)

    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("memes")]
    if "local_image_path" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE memes ADD COLUMN local_image_path TEXT"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
