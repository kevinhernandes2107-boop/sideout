import base64
import os
import random
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Annotated, List, Optional

import bcrypt
import httpx
import jwt
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, BeforeValidator, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import Base, engine, get_db, SessionLocal
from models import (
    Block,
    Match,
    MatchMessage,
    MatchSeries,
    Message,
    Notification,
    PasswordResetToken,
    PushToken,
    Rating,
    Report,
    RSVP,
    TeamMessage,
    Tournament,
    TournamentMatch,
    TournamentTeam,
    TournamentTeamMember,
    User,
    Venue,
    VenueReview,
)

load_dotenv()

# --- dev-only fallback. Set JWT_SECRET in .env before shipping this anywhere real. ---
JWT_SECRET = os.environ.get("JWT_SECRET", "vball-dev-secret-change-me-please-its-insecure")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24 * 14

GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
RESET_TOKEN_EXPIRES_MINUTES = 60
APP_SCHEME = "sideout"

UPLOADS_DIR = os.environ.get("UPLOADS_DIR", "uploads")
MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8MB
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
os.makedirs(UPLOADS_DIR, exist_ok=True)

bearer_scheme = HTTPBearer()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sideout Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

scheduler = BackgroundScheduler()


@app.on_event("startup")
def start_scheduler():
    scheduler.add_job(send_match_reminders, "interval", minutes=5, id="match_reminders", replace_existing=True)
    scheduler.add_job(generate_series_occurrences, "interval", hours=6, id="series_occurrences", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown(wait=False)


# ---------- auth helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def send_reset_email(to_email: str, token: str) -> None:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        print(
            f"[email] GMAIL_ADDRESS/GMAIL_APP_PASSWORD not set — skipping send. Reset token for {to_email}: {token}",
            flush=True,
        )
        return

    reset_link = f"{APP_SCHEME}://reset-password?token={token}"

    message = EmailMessage()
    message["Subject"] = "Reset your Sideout password"
    message["From"] = GMAIL_ADDRESS
    message["To"] = to_email
    message.set_content(
        "We received a request to reset your password.\n\n"
        f"If the app is installed, open this link on your phone: {reset_link}\n\n"
        f"Otherwise, open the app, go to Forgot Password, and paste this reset code:\n{token}\n\n"
        f"This expires in {RESET_TOKEN_EXPIRES_MINUTES} minutes. "
        "If you didn't request this, you can ignore this email."
    )

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            smtp.send_message(message)
    except Exception as exc:  # noqa: BLE001 - best-effort background email send
        print(f"[email] Failed to send reset email to {to_email}: {exc}", flush=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def blocked_user_ids(db: Session, user_id: int) -> set:
    """Ids blocked in either direction — mutual, so neither side sees the other."""
    rows = (
        db.query(Block)
        .filter(or_(Block.blocker_id == user_id, Block.blocked_id == user_id))
        .all()
    )
    ids = set()
    for row in rows:
        ids.add(row.blocked_id if row.blocker_id == user_id else row.blocker_id)
    return ids


def is_blocked_pair(db: Session, user_a: int, user_b: int) -> bool:
    return (
        db.query(Block)
        .filter(
            or_(
                (Block.blocker_id == user_a) & (Block.blocked_id == user_b),
                (Block.blocker_id == user_b) & (Block.blocked_id == user_a),
            )
        )
        .first()
        is not None
    )


def send_expo_push(tokens: List[str], title: str, body: str) -> None:
    if not tokens:
        return
    messages = [{"to": token, "title": title, "body": body} for token in tokens]
    try:
        httpx.post("https://exp.host/--/api/v2/push/send", json=messages, timeout=10)
    except Exception as exc:  # noqa: BLE001 - best-effort push send
        print(f"[push] Failed to send push notification: {exc}", flush=True)


NOTIFICATION_TYPE_LABELS = {
    "rsvp": "Someone RSVPs to your match",
    "waitlist_promoted": "You're promoted off a waitlist",
    "direct_message": "New direct messages",
    "match_message": "New match chat messages",
    "match_cancelled": "A match you joined gets cancelled",
    "match_reminder": "Match starting soon reminders",
    "series_co_host_added": "You're made a co-host of a recurring series",
    "team_message": "New tournament team chat messages",
    "tournament_team_joined": "Someone joins your tournament team",
    "tournament_started": "Your tournament bracket/schedule is set",
    "tournament_next_match": "Your next tournament opponent is set",
    "tournament_result": "Tournament match results",
    "tournament_completed": "Tournament finishes",
}


def create_notification(
    db: Session,
    background_tasks: BackgroundTasks,
    user_id: int,
    notif_type: str,
    message: str,
    related_match_id: Optional[int] = None,
    related_user_id: Optional[int] = None,
    related_tournament_id: Optional[int] = None,
) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    muted = set((user.muted_notification_types or "").split(",")) if user else set()
    if notif_type in muted:
        return

    db.add(
        Notification(
            user_id=user_id,
            type=notif_type,
            message=message,
            related_match_id=related_match_id,
            related_user_id=related_user_id,
            related_tournament_id=related_tournament_id,
        )
    )
    db.commit()

    tokens = [t.token for t in db.query(PushToken).filter(PushToken.user_id == user_id).all()]
    if tokens:
        background_tasks.add_task(send_expo_push, tokens, "Sideout", message)


def _notify_team(
    db: Session,
    background_tasks: BackgroundTasks,
    team_id: int,
    notif_type: str,
    message: str,
    tournament_id: int,
    exclude_user_id: Optional[int] = None,
) -> None:
    member_ids = [
        m.user_id
        for m in db.query(TournamentTeamMember).filter(TournamentTeamMember.team_id == team_id).all()
        if m.user_id != exclude_user_id
    ]
    for uid in member_ids:
        create_notification(db, background_tasks, uid, notif_type, message, related_tournament_id=tournament_id)


def send_match_reminders() -> None:
    """Runs on a background schedule (not inside a request), so it manages its own DB
    session and sends push directly instead of going through FastAPI's BackgroundTasks."""
    db = SessionLocal()
    try:
        window_start = datetime.utcnow() + timedelta(minutes=55)
        window_end = datetime.utcnow() + timedelta(minutes=65)
        matches = (
            db.query(Match)
            .filter(Match.reminder_sent.is_(False), Match.start_time >= window_start, Match.start_time <= window_end)
            .all()
        )

        for match in matches:
            recipient_ids = {match.host_id} | {r.user_id for r in match.rsvps if not r.waitlisted}
            for user_id in recipient_ids:
                db.add(
                    Notification(
                        user_id=user_id,
                        type="match_reminder",
                        message=f"\"{match.title}\" starts in about an hour",
                        related_match_id=match.id,
                    )
                )
                tokens = [t.token for t in db.query(PushToken).filter(PushToken.user_id == user_id).all()]
                if tokens:
                    send_expo_push(tokens, "Sideout", f'"{match.title}" starts in about an hour')

            match.reminder_sent = True

        db.commit()
    except Exception as exc:  # noqa: BLE001 - never let the background job crash the scheduler
        print(f"[reminders] Failed to send match reminders: {exc}", flush=True)
    finally:
        db.close()


def generate_series_occurrences() -> None:
    """Runs on a background schedule. For each active MatchSeries whose next occurrence
    falls within the lookahead window, create that Match (idempotently) and advance the
    series forward by its interval. Loops per-series to catch up if the server was down."""
    db = SessionLocal()
    try:
        lookahead = datetime.utcnow() + timedelta(days=5)
        series_list = db.query(MatchSeries).filter(MatchSeries.active.is_(True)).all()

        for series in series_list:
            safety_cap = 20
            while series.next_start <= lookahead and safety_cap > 0:
                safety_cap -= 1
                existing = (
                    db.query(Match)
                    .filter(Match.series_id == series.id, Match.start_time == series.next_start)
                    .first()
                )
                if not existing:
                    end_time = (
                        series.next_start + timedelta(minutes=series.duration_minutes)
                        if series.duration_minutes
                        else None
                    )
                    db.add(
                        Match(
                            host_id=series.host_id,
                            title=series.title,
                            city=series.city,
                            address=series.address,
                            latitude=series.latitude,
                            longitude=series.longitude,
                            skill_level=series.skill_level,
                            max_players=series.max_players,
                            recurrence=series.recurrence,
                            start_time=series.next_start,
                            end_time=end_time,
                            series_id=series.id,
                            co_host_id=series.co_host_id,
                        )
                    )
                series.next_start = series.next_start + timedelta(days=series.interval_days)
                db.commit()
    except Exception as exc:  # noqa: BLE001 - never let the background job crash the scheduler
        print(f"[series] Failed to generate series occurrences: {exc}", flush=True)
    finally:
        db.close()


# ---------- schemas ----------

def _attach_utc(value):
    """SQLite stores naive datetimes; every value we write is already UTC wall-clock
    (via datetime.utcnow() or a client's .toISOString()). Without reattaching tzinfo here,
    the JSON we send back has no timezone marker, and JS's `new Date(...)` silently parses
    that as *local* time instead of UTC, shifting displayed times by the client's UTC offset."""
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


UTCDateTime = Annotated[datetime, BeforeValidator(_attach_utc)]


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    pfp: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)


class UserOut(BaseModel):
    id: int
    username: str
    pfp: Optional[str] = None
    bio: Optional[str] = None
    position: Optional[str] = None
    skill_level: Optional[str] = None
    city: Optional[str] = None

    class Config:
        from_attributes = True


class MeOut(UserOut):
    email: EmailStr
    is_admin: bool = False


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeOut


class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    pfp: Optional[str] = None
    bio: Optional[str] = None
    position: Optional[str] = None
    skill_level: Optional[str] = None
    city: Optional[str] = None


class PhotoUpload(BaseModel):
    content_type: str
    data_base64: str


class MatchCreate(BaseModel):
    title: str
    city: Optional[str] = None
    address: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    skill_level: Optional[str] = None
    max_players: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    recurrence: Optional[str] = None


class MatchUpdate(BaseModel):
    title: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    skill_level: Optional[str] = None
    max_players: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    recurrence: Optional[str] = None


class MatchOut(BaseModel):
    id: int
    title: str
    city: Optional[str] = None
    address: Optional[str] = None
    start_time: Optional[UTCDateTime] = None
    end_time: Optional[UTCDateTime] = None
    skill_level: Optional[str] = None
    max_players: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    recurrence: Optional[str] = None
    series_id: Optional[int] = None
    host: UserOut
    co_host: Optional[UserOut] = None
    rsvp_count: int
    going: bool
    waitlist_count: int
    on_waitlist: bool


class RosterEntryOut(BaseModel):
    user: UserOut
    waitlisted: bool


class MatchDetailOut(MatchOut):
    roster: List[RosterEntryOut]


class MatchSeriesCreate(BaseModel):
    title: str
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    skill_level: Optional[str] = None
    max_players: Optional[int] = None
    recurrence: str  # "Weekly" or "Biweekly"
    start_time: datetime
    end_time: Optional[datetime] = None


class MatchSeriesOut(BaseModel):
    id: int
    title: str
    city: Optional[str] = None
    address: Optional[str] = None
    recurrence: str
    next_start: UTCDateTime
    active: bool
    host: UserOut
    co_host: Optional[UserOut] = None

    class Config:
        from_attributes = True


class CoHostUpdate(BaseModel):
    co_host_username: Optional[str] = None  # omit/null to clear the co-host


class VenueOut(BaseModel):
    id: int
    address: str
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rating_average: Optional[float] = None
    rating_count: int

    class Config:
        from_attributes = True


class VenueResolveRequest(BaseModel):
    address: str
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class VenueReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    body: Optional[str] = None


class VenueReviewOut(BaseModel):
    id: int
    venue_id: int
    user: UserOut
    rating: int
    body: Optional[str] = None
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class MatchMessageCreate(BaseModel):
    body: str


class MatchMessageOut(BaseModel):
    id: int
    match_id: int
    sender: UserOut
    body: str
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class RatingCreate(BaseModel):
    ratee_id: int
    sportsmanship: int = Field(ge=1, le=5)


class RatingSummaryOut(BaseModel):
    average: Optional[float] = None
    count: int


class BlockedUserOut(BaseModel):
    user: UserOut


class ReportCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ReportOut(BaseModel):
    id: int
    reporter: UserOut
    reported: UserOut
    reason: str
    resolved: bool
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: int
    type: str
    message: str
    related_match_id: Optional[int] = None
    related_user_id: Optional[int] = None
    related_tournament_id: Optional[int] = None
    read: bool
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class PushTokenRegister(BaseModel):
    token: str


class NotificationPreferencesOut(BaseModel):
    muted_types: List[str]


class NotificationPreferencesUpdate(BaseModel):
    muted_types: List[str]


class TeamMessageCreate(BaseModel):
    body: str


class TeamMessageOut(BaseModel):
    id: int
    team_id: int
    sender: UserOut
    body: str
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=72)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=72)


class MessageCreate(BaseModel):
    body: str


class MessageOut(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    body: str
    created_at: UTCDateTime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    user: UserOut
    last_message: str
    last_message_at: UTCDateTime


# ---------- auth endpoints ----------

@app.post("/api/register", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        pfp=payload.pfp or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthResponse(access_token=create_token(user.id), user=user)


@app.post("/api/login", response_model=AuthResponse)
def login_user(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return AuthResponse(access_token=create_token(user.id), user=user)


@app.post("/api/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()

        token = secrets.token_urlsafe(32)
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRES_MINUTES),
            )
        )
        db.commit()
        background_tasks.add_task(send_reset_email, user.email, token)

    # Always return the same message so we don't leak which emails are registered.
    return {"message": "If that email is registered, a reset link has been sent."}


@app.post("/api/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_token = db.query(PasswordResetToken).filter(PasswordResetToken.token == payload.token).first()
    if not reset_token or reset_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")

    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")

    user.hashed_password = hash_password(payload.new_password)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).delete()
    db.commit()
    return {"message": "Password updated. You can now log in."}


@app.post("/api/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated."}


# ---------- profile endpoints ----------

@app.get("/api/me", response_model=MeOut)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user


@app.patch("/api/me", response_model=MeOut)
def update_me(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True)

    new_username = updates.get("username")
    if new_username and new_username != current_user.username:
        if db.query(User).filter(User.username == new_username, User.id != current_user.id).first():
            raise HTTPException(status_code=400, detail="Username already taken")

    for field, value in updates.items():
        setattr(current_user, field, value)

    db.commit()
    db.refresh(current_user)
    return current_user


@app.delete("/api/me")
def delete_my_account(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes the account and everything tied to it. Content the user hosted that other
    people depend on (matches, series, tournaments) is cancelled/removed rather than left
    dangling, with the same cancellation notifications a live cancel would send."""
    user_id = current_user.id
    now = datetime.utcnow()

    # Tournaments they host: ORM cascade removes teams/members/matches; team_messages aren't
    # cascaded, so clear those first.
    hosted_tournaments = db.query(Tournament).filter(Tournament.host_id == user_id).all()
    for t in hosted_tournaments:
        team_ids = [team.id for team in t.teams]
        if team_ids:
            db.query(TeamMessage).filter(TeamMessage.team_id.in_(team_ids)).delete(synchronize_session=False)
        db.delete(t)
    db.commit()

    # Team messages they sent in teams belonging to tournaments hosted by someone else.
    db.query(TeamMessage).filter(TeamMessage.sender_id == user_id).delete(synchronize_session=False)
    db.commit()

    # Tournament teams they're a member of elsewhere: leave, reassigning captaincy if needed.
    memberships = db.query(TournamentTeamMember).filter(TournamentTeamMember.user_id == user_id).all()
    for membership in memberships:
        team = db.query(TournamentTeam).filter(TournamentTeam.id == membership.team_id).first()
        if not team:
            continue
        db.delete(membership)
        db.commit()
        remaining = (
            db.query(TournamentTeamMember)
            .filter(TournamentTeamMember.team_id == team.id)
            .order_by(TournamentTeamMember.created_at)
            .all()
        )
        if not remaining:
            db.delete(team)
        elif team.captain_id == user_id:
            team.captain_id = remaining[0].user_id
        db.commit()

    # Series they co-host for someone else: just step down, the series carries on.
    db.query(MatchSeries).filter(MatchSeries.co_host_id == user_id).update(
        {"co_host_id": None}, synchronize_session=False
    )
    db.commit()

    # Series they host: stop generating and cancel not-yet-started occurrences.
    hosted_series = db.query(MatchSeries).filter(MatchSeries.host_id == user_id).all()
    for series in hosted_series:
        series.active = False
    db.commit()
    for series in hosted_series:
        future_matches = (
            db.query(Match).filter(Match.series_id == series.id, Match.start_time > now).all()
        )
        for match in future_matches:
            _notify_cancelled_match(db, background_tasks, match, user_id)
            db.query(MatchMessage).filter(MatchMessage.match_id == match.id).delete()
            db.query(Rating).filter(Rating.match_id == match.id).delete()
            db.delete(match)
        db.commit()
    series_ids = [series.id for series in hosted_series]
    if series_ids:
        db.query(MatchSeries).filter(MatchSeries.id.in_(series_ids)).delete(synchronize_session=False)
        db.commit()

    # Matches they co-host for someone else: just step down.
    db.query(Match).filter(Match.co_host_id == user_id).update(
        {"co_host_id": None}, synchronize_session=False
    )
    db.commit()

    # Matches they host (standalone or already-past series occurrences).
    hosted_matches = db.query(Match).filter(Match.host_id == user_id).all()
    for match in hosted_matches:
        if match.start_time and match.start_time > now:
            _notify_cancelled_match(db, background_tasks, match, user_id)
        db.query(MatchMessage).filter(MatchMessage.match_id == match.id).delete()
        db.query(Rating).filter(Rating.match_id == match.id).delete()
        db.delete(match)
    db.commit()

    # Everything else that's simply theirs.
    db.query(RSVP).filter(RSVP.user_id == user_id).delete(synchronize_session=False)
    db.query(MatchMessage).filter(MatchMessage.sender_id == user_id).delete(synchronize_session=False)
    db.query(Rating).filter(
        or_(Rating.rater_id == user_id, Rating.ratee_id == user_id)
    ).delete(synchronize_session=False)
    db.query(Message).filter(
        or_(Message.sender_id == user_id, Message.recipient_id == user_id)
    ).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    db.query(PushToken).filter(PushToken.user_id == user_id).delete(synchronize_session=False)
    db.query(Block).filter(
        or_(Block.blocker_id == user_id, Block.blocked_id == user_id)
    ).delete(synchronize_session=False)
    db.query(Report).filter(
        or_(Report.reporter_id == user_id, Report.reported_id == user_id)
    ).delete(synchronize_session=False)
    db.query(VenueReview).filter(VenueReview.user_id == user_id).delete(synchronize_session=False)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete(synchronize_session=False)
    db.commit()

    db.delete(current_user)
    db.commit()

    return {"message": "Account deleted."}


@app.post("/api/me/photo", response_model=MeOut)
def upload_photo(
    payload: PhotoUpload,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    extension = ALLOWED_IMAGE_TYPES.get(payload.content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPEG, PNG, or WebP.")

    try:
        raw = base64.b64decode(payload.data_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data.")

    if not raw:
        raise HTTPException(status_code=400, detail="Invalid image data.")
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large (max 8MB).")

    filename = f"user{current_user.id}_{secrets.token_hex(8)}.{extension}"
    with open(os.path.join(UPLOADS_DIR, filename), "wb") as f:
        f.write(raw)

    current_user.pfp = f"{str(request.base_url).rstrip('/')}/uploads/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@app.get("/api/users", response_model=List[UserOut])
def list_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hidden = blocked_user_ids(db, current_user.id)
    hidden.add(current_user.id)
    return db.query(User).filter(User.id.notin_(hidden)).order_by(User.username).all()


@app.get("/api/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ---------- blocking & reporting ----------

@app.post("/api/users/{user_id}/block")
def block_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't block yourself")
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(Block).filter(Block.blocker_id == current_user.id, Block.blocked_id == user_id).first()
    if not existing:
        db.add(Block(blocker_id=current_user.id, blocked_id=user_id))
        db.commit()
    return {"message": "User blocked."}


@app.delete("/api/users/{user_id}/block")
def unblock_user(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Block).filter(Block.blocker_id == current_user.id, Block.blocked_id == user_id).delete()
    db.commit()
    return {"message": "User unblocked."}


@app.get("/api/blocked-users", response_model=List[BlockedUserOut])
def list_blocked_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Block).filter(Block.blocker_id == current_user.id).all()
    return [BlockedUserOut(user=row.blocked_user) for row in rows if row.blocked_user]


@app.post("/api/users/{user_id}/report")
def report_user(
    user_id: int,
    payload: ReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't report yourself")
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")

    db.add(Report(reporter_id=current_user.id, reported_id=user_id, reason=payload.reason.strip()))
    db.commit()
    return {"message": "Report submitted. Thanks for letting us know."}


# ---------- admin ----------

@app.get("/api/reports", response_model=List[ReportOut])
def list_reports(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(Report).order_by(Report.resolved, Report.created_at.desc()).all()


@app.post("/api/reports/{report_id}/resolve")
def resolve_report(report_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.resolved = True
    db.commit()
    return {"message": "Report marked resolved."}


# ---------- match endpoints ----------

def _match_to_out(match: Match, current_user: User) -> MatchOut:
    active = [r for r in match.rsvps if not r.waitlisted]
    waitlist = [r for r in match.rsvps if r.waitlisted]
    mine = next((r for r in match.rsvps if r.user_id == current_user.id), None)
    return MatchOut(
        id=match.id,
        title=match.title,
        city=match.city,
        address=match.address,
        start_time=match.start_time,
        end_time=match.end_time,
        skill_level=match.skill_level,
        max_players=match.max_players,
        latitude=match.latitude,
        longitude=match.longitude,
        recurrence=match.recurrence,
        series_id=match.series_id,
        host=match.host,
        co_host=match.co_host,
        rsvp_count=len(active),
        going=mine is not None and not mine.waitlisted,
        waitlist_count=len(waitlist),
        on_waitlist=mine is not None and mine.waitlisted,
    )


def _match_to_detail(match: Match, current_user: User) -> MatchDetailOut:
    base = _match_to_out(match, current_user)
    roster = [
        RosterEntryOut(user=r.user, waitlisted=r.waitlisted)
        for r in sorted(match.rsvps, key=lambda r: r.created_at)
    ]
    return MatchDetailOut(**base.model_dump(), roster=roster)


def _is_match_manager(match: Match, user_id: int) -> bool:
    return match.host_id == user_id or (match.co_host_id is not None and match.co_host_id == user_id)


def _require_match_manager(match: Match, current_user: User) -> None:
    if not _is_match_manager(match, current_user.id):
        raise HTTPException(status_code=403, detail="Only the host or co-host can do that")


def _notify_cancelled_match(db: Session, background_tasks: BackgroundTasks, match: Match, actor_id: int) -> None:
    recipient_ids = {r.user_id for r in match.rsvps} | {match.host_id}
    if match.co_host_id:
        recipient_ids.add(match.co_host_id)
    recipient_ids.discard(actor_id)
    for uid in recipient_ids:
        create_notification(
            db, background_tasks, uid, "match_cancelled", f"\"{match.title}\" was cancelled by the host.",
        )


@app.get("/api/matches", response_model=List[MatchOut])
def list_matches(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hidden_hosts = blocked_user_ids(db, current_user.id)
    matches = db.query(Match).order_by(Match.start_time.is_(None), Match.start_time).all()
    return [_match_to_out(m, current_user) for m in matches if m.host_id not in hidden_hosts]


@app.post("/api/matches", status_code=status.HTTP_201_CREATED, response_model=MatchOut)
def create_match(
    payload: MatchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = Match(host_id=current_user.id, **payload.model_dump())
    db.add(match)
    db.commit()
    db.refresh(match)
    return _match_to_out(match, current_user)


@app.post("/api/matches/series", status_code=status.HTTP_201_CREATED, response_model=MatchOut)
def create_match_series(
    payload: MatchSeriesCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.recurrence not in ("Weekly", "Biweekly"):
        raise HTTPException(status_code=400, detail="recurrence must be 'Weekly' or 'Biweekly'")
    interval_days = 7 if payload.recurrence == "Weekly" else 14

    duration_minutes = None
    if payload.end_time:
        duration_minutes = int((payload.end_time - payload.start_time).total_seconds() // 60)

    series = MatchSeries(
        host_id=current_user.id,
        title=payload.title,
        city=payload.city,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        skill_level=payload.skill_level,
        max_players=payload.max_players,
        recurrence=payload.recurrence,
        interval_days=interval_days,
        duration_minutes=duration_minutes,
        next_start=payload.start_time + timedelta(days=interval_days),
    )
    db.add(series)
    db.flush()

    match = Match(
        host_id=current_user.id,
        title=payload.title,
        city=payload.city,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        skill_level=payload.skill_level,
        max_players=payload.max_players,
        recurrence=payload.recurrence,
        start_time=payload.start_time,
        end_time=payload.end_time,
        series_id=series.id,
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return _match_to_out(match, current_user)


@app.get("/api/series", response_model=List[MatchSeriesOut])
def list_my_series(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(MatchSeries)
        .filter(or_(MatchSeries.host_id == current_user.id, MatchSeries.co_host_id == current_user.id))
        .order_by(MatchSeries.active.desc(), MatchSeries.next_start)
        .all()
    )


@app.patch("/api/series/{series_id}/co-host", response_model=MatchSeriesOut)
def set_series_co_host(
    series_id: int,
    payload: CoHostUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    series = db.query(MatchSeries).filter(MatchSeries.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if series.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can set a co-host")

    if payload.co_host_username:
        username = payload.co_host_username.strip().lstrip("@")
        co_host = db.query(User).filter(User.username == username).first()
        if not co_host:
            raise HTTPException(status_code=404, detail="No player found with that username")
        if co_host.id == series.host_id:
            raise HTTPException(status_code=400, detail="You're already the host")
        series.co_host_id = co_host.id
    else:
        series.co_host_id = None

    # Backfill co_host onto not-yet-started occurrences already generated for this series --
    # otherwise only occurrences generated *after* this call would pick up the new co-host.
    db.query(Match).filter(
        Match.series_id == series_id, Match.start_time > datetime.utcnow()
    ).update({"co_host_id": series.co_host_id}, synchronize_session=False)
    db.commit()

    if payload.co_host_username:
        create_notification(
            db, background_tasks, series.co_host_id, "series_co_host_added",
            f"@{current_user.username} made you co-host of \"{series.title}\"",
        )

    db.refresh(series)
    return series


def _is_series_manager(series: MatchSeries, user_id: int) -> bool:
    return series.host_id == user_id or (series.co_host_id is not None and series.co_host_id == user_id)


@app.delete("/api/series/{series_id}")
def cancel_series(
    series_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    series = db.query(MatchSeries).filter(MatchSeries.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if not _is_series_manager(series, current_user.id):
        raise HTTPException(status_code=403, detail="Only the host or co-host can do that")

    series.active = False
    db.commit()

    future_matches = (
        db.query(Match)
        .filter(Match.series_id == series_id, Match.start_time > datetime.utcnow())
        .all()
    )
    for match in future_matches:
        _notify_cancelled_match(db, background_tasks, match, current_user.id)
        db.query(MatchMessage).filter(MatchMessage.match_id == match.id).delete()
        db.query(Rating).filter(Rating.match_id == match.id).delete()
        db.delete(match)
    db.commit()

    return {"message": "Series cancelled."}


@app.get("/api/matches/{match_id}", response_model=MatchDetailOut)
def get_match(match_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return _match_to_detail(match, current_user)


@app.patch("/api/matches/{match_id}", response_model=MatchOut)
def update_match(
    match_id: int,
    payload: MatchUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    _require_match_manager(match, current_user)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(match, field, value)

    db.commit()
    db.refresh(match)
    return _match_to_out(match, current_user)


@app.delete("/api/matches/{match_id}")
def cancel_match(
    match_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    _require_match_manager(match, current_user)

    _notify_cancelled_match(db, background_tasks, match, current_user.id)

    db.query(MatchMessage).filter(MatchMessage.match_id == match_id).delete()
    db.query(Rating).filter(Rating.match_id == match_id).delete()
    db.delete(match)  # cascades RSVPs via relationship config
    db.commit()
    return {"message": "Match cancelled."}


@app.post("/api/matches/{match_id}/rsvp", response_model=MatchOut)
def rsvp_to_match(
    match_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    existing = db.query(RSVP).filter(RSVP.match_id == match_id, RSVP.user_id == current_user.id).first()
    if existing:
        return _match_to_out(match, current_user)

    active_count = sum(1 for r in match.rsvps if not r.waitlisted)
    will_waitlist = bool(match.max_players) and active_count >= match.max_players

    db.add(RSVP(match_id=match_id, user_id=current_user.id, waitlisted=will_waitlist))
    db.commit()
    db.refresh(match)

    if not will_waitlist and match.host_id != current_user.id:
        create_notification(
            db,
            background_tasks,
            match.host_id,
            "rsvp",
            f"@{current_user.username} is going to \"{match.title}\"",
            related_match_id=match.id,
            related_user_id=current_user.id,
        )

    return _match_to_out(match, current_user)


@app.delete("/api/matches/{match_id}/rsvp", response_model=MatchOut)
def cancel_rsvp(
    match_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    leaving = db.query(RSVP).filter(RSVP.match_id == match_id, RSVP.user_id == current_user.id).first()
    was_active = leaving is not None and not leaving.waitlisted
    if leaving:
        db.delete(leaving)
        db.commit()

    if was_active:
        next_in_line = (
            db.query(RSVP)
            .filter(RSVP.match_id == match_id, RSVP.waitlisted.is_(True))
            .order_by(RSVP.created_at)
            .first()
        )
        if next_in_line:
            next_in_line.waitlisted = False
            db.commit()
            create_notification(
                db,
                background_tasks,
                next_in_line.user_id,
                "waitlist_promoted",
                f"A spot opened up in \"{match.title}\" — you're in!",
                related_match_id=match.id,
            )

    db.refresh(match)
    return _match_to_out(match, current_user)


# ---------- match chat ----------

@app.get("/api/matches/{match_id}/messages", response_model=List[MatchMessageOut])
def list_match_messages(match_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return (
        db.query(MatchMessage)
        .filter(MatchMessage.match_id == match_id)
        .order_by(MatchMessage.created_at)
        .all()
    )


@app.post("/api/matches/{match_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MatchMessageOut)
def post_match_message(
    match_id: int,
    payload: MatchMessageCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    is_manager = _is_match_manager(match, current_user.id)
    is_participant = (
        db.query(RSVP)
        .filter(RSVP.match_id == match_id, RSVP.user_id == current_user.id, RSVP.waitlisted.is_(False))
        .first()
        is not None
    )
    if not is_manager and not is_participant:
        raise HTTPException(status_code=403, detail="Only the host and confirmed players can post here")

    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message = MatchMessage(match_id=match_id, sender_id=current_user.id, body=payload.body.strip())
    db.add(message)
    db.commit()
    db.refresh(message)

    recipients = {r.user_id for r in match.rsvps if not r.waitlisted}
    recipients.add(match.host_id)
    if match.co_host_id:
        recipients.add(match.co_host_id)
    recipients.discard(current_user.id)
    for recipient_id in recipients:
        create_notification(
            db,
            background_tasks,
            recipient_id,
            "match_message",
            f"@{current_user.username} in \"{match.title}\": {message.body[:80]}",
            related_match_id=match.id,
            related_user_id=current_user.id,
        )

    return message


# ---------- ratings ----------

@app.post("/api/matches/{match_id}/ratings", response_model=RatingSummaryOut)
def rate_teammate(
    match_id: int,
    payload: RatingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if not match.start_time or match.start_time > datetime.utcnow():
        raise HTTPException(status_code=400, detail="You can only rate teammates after the match has happened")
    if payload.ratee_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't rate yourself")

    rater_ok = _is_match_manager(match, current_user.id) or any(
        r.user_id == current_user.id and not r.waitlisted for r in match.rsvps
    )
    ratee_ok = _is_match_manager(match, payload.ratee_id) or any(
        r.user_id == payload.ratee_id and not r.waitlisted for r in match.rsvps
    )
    if not rater_ok or not ratee_ok:
        raise HTTPException(status_code=400, detail="Both players must have been part of this match")

    existing = (
        db.query(Rating)
        .filter(Rating.match_id == match_id, Rating.rater_id == current_user.id, Rating.ratee_id == payload.ratee_id)
        .first()
    )
    if existing:
        existing.sportsmanship = payload.sportsmanship
    else:
        db.add(Rating(match_id=match_id, rater_id=current_user.id, ratee_id=payload.ratee_id, sportsmanship=payload.sportsmanship))
    db.commit()

    return _rating_summary(db, payload.ratee_id)


def _rating_summary(db: Session, user_id: int) -> RatingSummaryOut:
    ratings = db.query(Rating).filter(Rating.ratee_id == user_id).all()
    if not ratings:
        return RatingSummaryOut(average=None, count=0)
    avg = sum(r.sportsmanship for r in ratings) / len(ratings)
    return RatingSummaryOut(average=round(avg, 1), count=len(ratings))


@app.get("/api/users/{user_id}/rating-summary", response_model=RatingSummaryOut)
def get_rating_summary(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _rating_summary(db, user_id)


class UserStatsOut(BaseModel):
    matches_hosted: int
    matches_played: int
    tournaments_won: int
    rating_average: Optional[float] = None
    rating_count: int


def _compute_standings_stats(db: Session, tournament_id: int) -> dict:
    stats = {
        team.id: {"wins": 0, "losses": 0, "ties": 0, "points_for": 0, "points_against": 0}
        for team in db.query(TournamentTeam).filter(TournamentTeam.tournament_id == tournament_id).all()
    }
    matches = (
        db.query(TournamentMatch)
        .filter(TournamentMatch.tournament_id == tournament_id, TournamentMatch.status == "completed")
        .all()
    )
    for m in matches:
        if m.team_a_id in stats:
            stats[m.team_a_id]["points_for"] += m.team_a_score or 0
            stats[m.team_a_id]["points_against"] += m.team_b_score or 0
        if m.team_b_id in stats:
            stats[m.team_b_id]["points_for"] += m.team_b_score or 0
            stats[m.team_b_id]["points_against"] += m.team_a_score or 0
        if m.winner_team_id:
            loser_id = m.team_b_id if m.winner_team_id == m.team_a_id else m.team_a_id
            if m.winner_team_id in stats:
                stats[m.winner_team_id]["wins"] += 1
            if loser_id in stats:
                stats[loser_id]["losses"] += 1
        else:
            if m.team_a_id in stats:
                stats[m.team_a_id]["ties"] += 1
            if m.team_b_id in stats:
                stats[m.team_b_id]["ties"] += 1
    return stats


@app.get("/api/users/{user_id}/stats", response_model=UserStatsOut)
def get_user_stats(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    matches_hosted = db.query(Match).filter(Match.host_id == user_id).count()
    matches_played = db.query(RSVP).filter(RSVP.user_id == user_id, RSVP.waitlisted.is_(False)).count()
    rating = _rating_summary(db, user_id)

    my_team_ids = [
        m.team_id for m in db.query(TournamentTeamMember).filter(TournamentTeamMember.user_id == user_id).all()
    ]
    tournaments_won = 0
    if my_team_ids:
        my_teams = db.query(TournamentTeam).filter(TournamentTeam.id.in_(my_team_ids)).all()
        for team in my_teams:
            t = team.tournament
            if t.status != "completed":
                continue
            if t.format == "single_elim":
                final_match = (
                    db.query(TournamentMatch)
                    .filter(TournamentMatch.tournament_id == t.id)
                    .order_by(TournamentMatch.round.desc())
                    .first()
                )
                if final_match and final_match.winner_team_id == team.id:
                    tournaments_won += 1
            elif t.format == "round_robin":
                stats = _compute_standings_stats(db, t.id)
                ranked = sorted(stats.items(), key=lambda kv: (-kv[1]["wins"], -(kv[1]["points_for"] - kv[1]["points_against"])))
                if ranked and ranked[0][0] == team.id:
                    if len(ranked) == 1 or ranked[0][1]["wins"] > ranked[1][1]["wins"]:
                        tournaments_won += 1

    return UserStatsOut(
        matches_hosted=matches_hosted,
        matches_played=matches_played,
        tournaments_won=tournaments_won,
        rating_average=rating.average,
        rating_count=rating.count,
    )


# ---------- venue reviews ----------

def _normalize_address_key(address: str) -> str:
    return " ".join(address.strip().lower().split())


def _venue_to_out(db: Session, venue: Venue) -> VenueOut:
    reviews = db.query(VenueReview).filter(VenueReview.venue_id == venue.id).all()
    avg = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else None
    return VenueOut(
        id=venue.id,
        address=venue.address,
        city=venue.city,
        latitude=venue.latitude,
        longitude=venue.longitude,
        rating_average=avg,
        rating_count=len(reviews),
    )


@app.post("/api/venues/resolve", response_model=VenueOut)
def resolve_venue(
    payload: VenueResolveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not payload.address or not payload.address.strip():
        raise HTTPException(status_code=400, detail="An address is required to look up a venue")

    key = _normalize_address_key(payload.address)
    venue = db.query(Venue).filter(Venue.address_key == key).first()
    if not venue:
        venue = Venue(
            address=payload.address.strip(),
            address_key=key,
            city=payload.city,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
        db.add(venue)
        db.commit()
        db.refresh(venue)
    return _venue_to_out(db, venue)


@app.get("/api/venues/{venue_id}/reviews", response_model=List[VenueReviewOut])
def list_venue_reviews(venue_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    return (
        db.query(VenueReview)
        .filter(VenueReview.venue_id == venue_id)
        .order_by(VenueReview.created_at.desc())
        .all()
    )


@app.post("/api/venues/{venue_id}/reviews", status_code=status.HTTP_201_CREATED, response_model=VenueReviewOut)
def submit_venue_review(
    venue_id: int,
    payload: VenueReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    venue = db.query(Venue).filter(Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    existing = (
        db.query(VenueReview)
        .filter(VenueReview.venue_id == venue_id, VenueReview.user_id == current_user.id)
        .first()
    )
    if existing:
        existing.rating = payload.rating
        existing.body = payload.body
        db.commit()
        db.refresh(existing)
        return existing

    review = VenueReview(venue_id=venue_id, user_id=current_user.id, rating=payload.rating, body=payload.body)
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


# ---------- messaging endpoints ----------

@app.get("/api/conversations", response_model=List[ConversationOut])
def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    messages = (
        db.query(Message)
        .filter(or_(Message.sender_id == current_user.id, Message.recipient_id == current_user.id))
        .order_by(Message.created_at.desc())
        .all()
    )

    seen = {}
    for m in messages:
        other_id = m.recipient_id if m.sender_id == current_user.id else m.sender_id
        if other_id not in seen:
            seen[other_id] = m

    conversations = []
    for other_id, last in seen.items():
        other = db.query(User).filter(User.id == other_id).first()
        if other:
            conversations.append(
                ConversationOut(user=other, last_message=last.body, last_message_at=last.created_at)
            )
    conversations.sort(key=lambda c: c.last_message_at, reverse=True)
    return conversations


@app.get("/api/messages/{user_id}", response_model=List[MessageOut])
def get_thread(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    other = db.query(User).filter(User.id == user_id).first()
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    messages = (
        db.query(Message)
        .filter(
            or_(
                (Message.sender_id == current_user.id) & (Message.recipient_id == user_id),
                (Message.sender_id == user_id) & (Message.recipient_id == current_user.id),
            )
        )
        .order_by(Message.created_at)
        .all()
    )
    return messages


@app.post("/api/messages/{user_id}", status_code=status.HTTP_201_CREATED, response_model=MessageOut)
def send_message(
    user_id: int,
    payload: MessageCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    other = db.query(User).filter(User.id == user_id).first()
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    if is_blocked_pair(db, current_user.id, user_id):
        raise HTTPException(status_code=403, detail="You can't message this user")

    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message = Message(sender_id=current_user.id, recipient_id=user_id, body=payload.body.strip())
    db.add(message)
    db.commit()
    db.refresh(message)

    create_notification(
        db,
        background_tasks,
        user_id,
        "direct_message",
        f"@{current_user.username}: {message.body[:80]}",
        related_user_id=current_user.id,
    )

    return message


# ---------- notifications & push ----------

@app.get("/api/notifications", response_model=List[NotificationOut])
def list_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )


@app.post("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    db.commit()
    return {"message": "Marked as read."}


@app.get("/api/notification-preferences", response_model=NotificationPreferencesOut)
def get_notification_preferences(current_user: User = Depends(get_current_user)):
    muted = [t for t in (current_user.muted_notification_types or "").split(",") if t]
    return NotificationPreferencesOut(muted_types=muted)


@app.put("/api/notification-preferences", response_model=NotificationPreferencesOut)
def update_notification_preferences(
    payload: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cleaned = sorted({t for t in payload.muted_types if t in NOTIFICATION_TYPE_LABELS})
    current_user.muted_notification_types = ",".join(cleaned) if cleaned else None
    db.commit()
    return NotificationPreferencesOut(muted_types=cleaned)


@app.post("/api/push-token")
def register_push_token(
    payload: PushTokenRegister,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(PushToken)
        .filter(PushToken.user_id == current_user.id, PushToken.token == payload.token)
        .first()
    )
    if not existing:
        db.add(PushToken(user_id=current_user.id, token=payload.token))
        db.commit()
    return {"message": "Push token registered."}


# ---------- tournaments ----------

class TournamentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    format: str  # "single_elim" | "round_robin"
    skill_level: Optional[str] = None
    start_date: Optional[datetime] = None
    team_size: int = 6
    max_teams: Optional[int] = None


class TournamentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    skill_level: Optional[str] = None
    start_date: Optional[datetime] = None
    team_size: Optional[int] = None
    max_teams: Optional[int] = None


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class TournamentTeamOut(BaseModel):
    id: int
    name: str
    captain: UserOut
    members: List[UserOut]


class TournamentOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    format: str
    skill_level: Optional[str] = None
    start_date: Optional[UTCDateTime] = None
    team_size: int
    max_teams: Optional[int] = None
    status: str
    host: UserOut
    team_count: int


class TournamentDetailOut(TournamentOut):
    teams: List[TournamentTeamOut]


class TournamentMatchOut(BaseModel):
    id: int
    round: int
    bracket_position: int
    team_a: Optional[TournamentTeamOut] = None
    team_b: Optional[TournamentTeamOut] = None
    team_a_score: Optional[int] = None
    team_b_score: Optional[int] = None
    winner_team_id: Optional[int] = None
    status: str


class MatchResultSubmit(BaseModel):
    team_a_score: int = Field(ge=0)
    team_b_score: int = Field(ge=0)


class StandingRow(BaseModel):
    team: TournamentTeamOut
    wins: int
    losses: int
    ties: int
    points_for: int
    points_against: int


def _team_to_out(team: TournamentTeam) -> TournamentTeamOut:
    return TournamentTeamOut(
        id=team.id,
        name=team.name,
        captain=team.captain,
        members=[m.user for m in team.members],
    )


def _tournament_to_out(t: Tournament) -> TournamentOut:
    return TournamentOut(
        id=t.id,
        title=t.title,
        description=t.description,
        city=t.city,
        address=t.address,
        latitude=t.latitude,
        longitude=t.longitude,
        format=t.format,
        skill_level=t.skill_level,
        start_date=t.start_date,
        team_size=t.team_size,
        max_teams=t.max_teams,
        status=t.status,
        host=t.host,
        team_count=len(t.teams),
    )


def _match_to_tournament_out(match: TournamentMatch) -> TournamentMatchOut:
    return TournamentMatchOut(
        id=match.id,
        round=match.round,
        bracket_position=match.bracket_position,
        team_a=_team_to_out(match.team_a) if match.team_a else None,
        team_b=_team_to_out(match.team_b) if match.team_b else None,
        team_a_score=match.team_a_score,
        team_b_score=match.team_b_score,
        winner_team_id=match.winner_team_id,
        status=match.status,
    )


def _get_tournament_or_404(db: Session, tid: int) -> Tournament:
    t = db.query(Tournament).filter(Tournament.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


def _require_tournament_host(t: Tournament, current_user: User) -> None:
    if t.host_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the host can do that")


def _ensure_not_already_on_a_team(db: Session, tournament: Tournament, user_id: int) -> None:
    existing = (
        db.query(TournamentTeamMember)
        .join(TournamentTeam, TournamentTeamMember.team_id == TournamentTeam.id)
        .filter(TournamentTeam.tournament_id == tournament.id, TournamentTeamMember.user_id == user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="You're already on a team in this tournament")


def _advance_winner(db: Session, background_tasks: BackgroundTasks, tournament: Tournament, match: TournamentMatch) -> None:
    matches_in_round = (
        db.query(TournamentMatch)
        .filter(TournamentMatch.tournament_id == tournament.id, TournamentMatch.round == match.round)
        .count()
    )
    if matches_in_round == 1:
        tournament.status = "completed"
        db.commit()

        loser_id = match.team_a_id if match.winner_team_id == match.team_b_id else match.team_b_id
        _notify_team(
            db, background_tasks, match.winner_team_id, "tournament_completed",
            f"You're the champions of {tournament.title}!", tournament.id,
        )
        if loser_id:
            _notify_team(
                db, background_tasks, loser_id, "tournament_completed",
                f"{tournament.title} is complete — great run!", tournament.id,
            )
        return

    next_match = (
        db.query(TournamentMatch)
        .filter(
            TournamentMatch.tournament_id == tournament.id,
            TournamentMatch.round == match.round + 1,
            TournamentMatch.bracket_position == match.bracket_position // 2,
        )
        .first()
    )
    if not next_match:
        return

    if match.bracket_position % 2 == 0:
        next_match.team_a_id = match.winner_team_id
    else:
        next_match.team_b_id = match.winner_team_id
    db.commit()

    if next_match.team_a_id and next_match.team_b_id:
        team_a = db.query(TournamentTeam).filter(TournamentTeam.id == next_match.team_a_id).first()
        team_b = db.query(TournamentTeam).filter(TournamentTeam.id == next_match.team_b_id).first()
        _notify_team(
            db, background_tasks, next_match.team_a_id, "tournament_next_match",
            f"Round {next_match.round} of {tournament.title}: you play \"{team_b.name}\" next.", tournament.id,
        )
        _notify_team(
            db, background_tasks, next_match.team_b_id, "tournament_next_match",
            f"Round {next_match.round} of {tournament.title}: you play \"{team_a.name}\" next.", tournament.id,
        )


@app.post("/api/tournaments", status_code=status.HTTP_201_CREATED, response_model=TournamentOut)
def create_tournament(
    payload: TournamentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.format not in ("single_elim", "round_robin"):
        raise HTTPException(status_code=400, detail="format must be 'single_elim' or 'round_robin'")

    tournament = Tournament(host_id=current_user.id, **payload.model_dump())
    db.add(tournament)
    db.commit()
    db.refresh(tournament)
    return _tournament_to_out(tournament)


@app.get("/api/tournaments", response_model=List[TournamentOut])
def list_tournaments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hidden_hosts = blocked_user_ids(db, current_user.id)
    tournaments = db.query(Tournament).order_by(Tournament.start_date.is_(None), Tournament.start_date).all()
    return [_tournament_to_out(t) for t in tournaments if t.host_id not in hidden_hosts]


@app.get("/api/tournaments/{tid}", response_model=TournamentDetailOut)
def get_tournament(tid: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = _get_tournament_or_404(db, tid)
    base = _tournament_to_out(t)
    return TournamentDetailOut(**base.model_dump(), teams=[_team_to_out(team) for team in t.teams])


@app.patch("/api/tournaments/{tid}", response_model=TournamentOut)
def update_tournament(
    tid: int,
    payload: TournamentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_tournament_or_404(db, tid)
    _require_tournament_host(t, current_user)
    if t.status != "registration":
        raise HTTPException(status_code=400, detail="Can't edit a tournament once the bracket has started")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return _tournament_to_out(t)


@app.delete("/api/tournaments/{tid}")
def cancel_tournament(tid: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = _get_tournament_or_404(db, tid)
    _require_tournament_host(t, current_user)
    db.delete(t)
    db.commit()
    return {"message": "Tournament cancelled."}


@app.post("/api/tournaments/{tid}/teams", status_code=status.HTTP_201_CREATED, response_model=TournamentTeamOut)
def create_team(
    tid: int,
    payload: TeamCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_tournament_or_404(db, tid)
    if t.status != "registration":
        raise HTTPException(status_code=400, detail="Registration is closed for this tournament")
    if t.max_teams and len(t.teams) >= t.max_teams:
        raise HTTPException(status_code=400, detail="This tournament is full")
    _ensure_not_already_on_a_team(db, t, current_user.id)

    team = TournamentTeam(tournament_id=tid, name=payload.name.strip(), captain_id=current_user.id)
    db.add(team)
    db.commit()
    db.refresh(team)
    db.add(TournamentTeamMember(team_id=team.id, user_id=current_user.id))
    db.commit()
    db.refresh(team)
    return _team_to_out(team)


@app.post("/api/tournaments/{tid}/teams/{team_id}/join", response_model=TournamentTeamOut)
def join_team(
    tid: int,
    team_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_tournament_or_404(db, tid)
    if t.status != "registration":
        raise HTTPException(status_code=400, detail="Registration is closed for this tournament")
    team = db.query(TournamentTeam).filter(TournamentTeam.id == team_id, TournamentTeam.tournament_id == tid).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if len(team.members) >= t.team_size:
        raise HTTPException(status_code=400, detail="This team is full")
    _ensure_not_already_on_a_team(db, t, current_user.id)

    db.add(TournamentTeamMember(team_id=team.id, user_id=current_user.id))
    db.commit()
    db.refresh(team)

    create_notification(
        db,
        background_tasks,
        team.captain_id,
        "tournament_team_joined",
        f"@{current_user.username} joined \"{team.name}\" for {t.title}",
        related_user_id=current_user.id,
        related_tournament_id=t.id,
    )

    return _team_to_out(team)


@app.delete("/api/tournaments/{tid}/teams/{team_id}/leave")
def leave_team(
    tid: int,
    team_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = db.query(TournamentTeam).filter(TournamentTeam.id == team_id, TournamentTeam.tournament_id == tid).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    membership = (
        db.query(TournamentTeamMember)
        .filter(TournamentTeamMember.team_id == team_id, TournamentTeamMember.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=400, detail="You're not on this team")

    db.delete(membership)
    db.commit()

    remaining = (
        db.query(TournamentTeamMember)
        .filter(TournamentTeamMember.team_id == team_id)
        .order_by(TournamentTeamMember.created_at)
        .all()
    )
    if not remaining:
        db.delete(team)
    elif team.captain_id == current_user.id:
        team.captain_id = remaining[0].user_id
    db.commit()
    return {"message": "Left the team."}


# ---------- tournament team chat ----------

def _require_team_member(db: Session, team: TournamentTeam, user_id: int) -> None:
    is_member = (
        db.query(TournamentTeamMember)
        .filter(TournamentTeamMember.team_id == team.id, TournamentTeamMember.user_id == user_id)
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Only team members can do that")


@app.get("/api/teams/{team_id}/messages", response_model=List[TeamMessageOut])
def list_team_messages(team_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    team = db.query(TournamentTeam).filter(TournamentTeam.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_team_member(db, team, current_user.id)
    return (
        db.query(TeamMessage)
        .filter(TeamMessage.team_id == team_id)
        .order_by(TeamMessage.created_at)
        .all()
    )


@app.post("/api/teams/{team_id}/messages", status_code=status.HTTP_201_CREATED, response_model=TeamMessageOut)
def post_team_message(
    team_id: int,
    payload: TeamMessageCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = db.query(TournamentTeam).filter(TournamentTeam.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_team_member(db, team, current_user.id)

    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    message = TeamMessage(team_id=team_id, sender_id=current_user.id, body=payload.body.strip())
    db.add(message)
    db.commit()
    db.refresh(message)

    _notify_team(
        db, background_tasks, team_id, "team_message",
        f"@{current_user.username} in \"{team.name}\": {message.body[:80]}", team.tournament_id,
        exclude_user_id=current_user.id,
    )

    return message


@app.post("/api/tournaments/{tid}/generate-bracket", response_model=TournamentOut)
def generate_bracket(
    tid: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_tournament_or_404(db, tid)
    _require_tournament_host(t, current_user)
    if t.status != "registration":
        raise HTTPException(status_code=400, detail="The bracket has already been generated")

    teams = list(t.teams)
    if len(teams) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 teams to start")

    random.shuffle(teams)

    if t.format == "round_robin":
        position = 0
        for i in range(len(teams)):
            for j in range(i + 1, len(teams)):
                db.add(
                    TournamentMatch(
                        tournament_id=tid,
                        round=0,
                        bracket_position=position,
                        team_a_id=teams[i].id,
                        team_b_id=teams[j].id,
                    )
                )
                position += 1
        t.status = "in_progress"
        db.commit()
        db.refresh(t)

        for team in teams:
            _notify_team(
                db, background_tasks, team.id, "tournament_started",
                f"The schedule for {t.title} is live — check your matches.", t.id,
            )

        return _tournament_to_out(t)

    # single_elim: pad to the next power of two. Byes go to the first `num_byes`
    # shuffled teams (each paired with nothing) so no match ever ends up bye-vs-bye.
    bracket_size = 1
    while bracket_size < len(teams):
        bracket_size *= 2
    num_byes = bracket_size - len(teams)
    bye_teams = teams[:num_byes]
    paired_teams = teams[num_byes:]

    round1_matches: List[TournamentMatch] = []
    pos = 0
    for team in bye_teams:
        m = TournamentMatch(
            tournament_id=tid, round=1, bracket_position=pos,
            team_a_id=team.id, winner_team_id=team.id, status="completed",
        )
        db.add(m)
        round1_matches.append(m)
        pos += 1
    for i in range(0, len(paired_teams), 2):
        m = TournamentMatch(
            tournament_id=tid, round=1, bracket_position=pos,
            team_a_id=paired_teams[i].id, team_b_id=paired_teams[i + 1].id,
        )
        db.add(m)
        round1_matches.append(m)
        pos += 1
    db.flush()

    total_rounds = bracket_size.bit_length() - 1
    matches_in_round = bracket_size // 2
    for rnd in range(2, total_rounds + 1):
        matches_in_round //= 2
        for p in range(matches_in_round):
            db.add(TournamentMatch(tournament_id=tid, round=rnd, bracket_position=p))
    db.flush()

    t.status = "in_progress"
    db.commit()

    for m in round1_matches:
        if m.status == "completed":
            _notify_team(
                db, background_tasks, m.team_a_id, "tournament_started",
                f"You drew a bye in Round 1 of {t.title} — you advance automatically.", t.id,
            )
            _advance_winner(db, background_tasks, t, m)
        else:
            team_a = db.query(TournamentTeam).filter(TournamentTeam.id == m.team_a_id).first()
            team_b = db.query(TournamentTeam).filter(TournamentTeam.id == m.team_b_id).first()
            _notify_team(
                db, background_tasks, m.team_a_id, "tournament_started",
                f"The bracket is set for {t.title} — you play \"{team_b.name}\" in Round 1.", t.id,
            )
            _notify_team(
                db, background_tasks, m.team_b_id, "tournament_started",
                f"The bracket is set for {t.title} — you play \"{team_a.name}\" in Round 1.", t.id,
            )

    db.refresh(t)
    return _tournament_to_out(t)


@app.get("/api/tournaments/{tid}/matches", response_model=List[TournamentMatchOut])
def list_tournament_matches(tid: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_tournament_or_404(db, tid)
    matches = (
        db.query(TournamentMatch)
        .filter(TournamentMatch.tournament_id == tid)
        .order_by(TournamentMatch.round, TournamentMatch.bracket_position)
        .all()
    )
    return [_match_to_tournament_out(m) for m in matches]


@app.post("/api/tournaments/{tid}/matches/{match_id}/result", response_model=TournamentMatchOut)
def submit_tournament_result(
    tid: int,
    match_id: int,
    payload: MatchResultSubmit,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_tournament_or_404(db, tid)
    _require_tournament_host(t, current_user)
    match = db.query(TournamentMatch).filter(TournamentMatch.id == match_id, TournamentMatch.tournament_id == tid).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if not match.team_a_id or not match.team_b_id:
        raise HTTPException(status_code=400, detail="Both teams must be set before entering a result")
    if t.format == "single_elim" and payload.team_a_score == payload.team_b_score:
        raise HTTPException(status_code=400, detail="Single-elimination matches can't end in a tie")

    match.team_a_score = payload.team_a_score
    match.team_b_score = payload.team_b_score
    if payload.team_a_score > payload.team_b_score:
        match.winner_team_id = match.team_a_id
    elif payload.team_b_score > payload.team_a_score:
        match.winner_team_id = match.team_b_id
    else:
        match.winner_team_id = None
    match.status = "completed"
    db.commit()

    team_a_name = match.team_a.name
    team_b_name = match.team_b.name
    result_line = f"{team_a_name} {payload.team_a_score} - {payload.team_b_score} {team_b_name} in {t.title}"
    _notify_team(db, background_tasks, match.team_a_id, "tournament_result", result_line, t.id)
    _notify_team(db, background_tasks, match.team_b_id, "tournament_result", result_line, t.id)

    if t.format == "single_elim" and match.winner_team_id:
        _advance_winner(db, background_tasks, t, match)
    elif t.format == "round_robin":
        remaining = (
            db.query(TournamentMatch)
            .filter(TournamentMatch.tournament_id == tid, TournamentMatch.status == "pending")
            .count()
        )
        if remaining == 0:
            t.status = "completed"
            db.commit()
            for team in t.teams:
                _notify_team(
                    db, background_tasks, team.id, "tournament_completed",
                    f"{t.title} is complete — final standings are in.", t.id,
                )

    db.refresh(match)
    return _match_to_tournament_out(match)


@app.get("/api/tournaments/{tid}/standings", response_model=List[StandingRow])
def get_standings(tid: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = _get_tournament_or_404(db, tid)
    if t.format != "round_robin":
        raise HTTPException(status_code=400, detail="Standings are only available for round-robin tournaments")

    stats = {team.id: {"wins": 0, "losses": 0, "ties": 0, "points_for": 0, "points_against": 0} for team in t.teams}
    matches = (
        db.query(TournamentMatch)
        .filter(TournamentMatch.tournament_id == tid, TournamentMatch.status == "completed")
        .all()
    )
    for m in matches:
        if m.team_a_id in stats:
            stats[m.team_a_id]["points_for"] += m.team_a_score or 0
            stats[m.team_a_id]["points_against"] += m.team_b_score or 0
        if m.team_b_id in stats:
            stats[m.team_b_id]["points_for"] += m.team_b_score or 0
            stats[m.team_b_id]["points_against"] += m.team_a_score or 0

        if m.winner_team_id:
            loser_id = m.team_b_id if m.winner_team_id == m.team_a_id else m.team_a_id
            if m.winner_team_id in stats:
                stats[m.winner_team_id]["wins"] += 1
            if loser_id in stats:
                stats[loser_id]["losses"] += 1
        else:
            if m.team_a_id in stats:
                stats[m.team_a_id]["ties"] += 1
            if m.team_b_id in stats:
                stats[m.team_b_id]["ties"] += 1

    rows = [StandingRow(team=_team_to_out(team), **stats[team.id]) for team in t.teams]
    rows.sort(key=lambda r: (-r.wins, -(r.points_for - r.points_against)))
    return rows


@app.get("/")
def root():
    return {"message": "Sideout API is running successfully!"}
