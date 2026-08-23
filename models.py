from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    pfp = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    position = Column(String, nullable=True)
    skill_level = Column(String, nullable=True)
    city = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    muted_notification_types = Column(String, nullable=True)  # comma-separated notification `type` keys
    created_at = Column(DateTime, default=datetime.utcnow)


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    city = Column(String, nullable=True)
    address = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    skill_level = Column(String, nullable=True)
    max_players = Column(Integer, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    recurrence = Column(String, nullable=True)  # None, "Weekly", "Biweekly"
    reminder_sent = Column(Boolean, default=False, nullable=False)
    series_id = Column(Integer, ForeignKey("match_series.id"), nullable=True)
    co_host_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    host = relationship("User", foreign_keys=[host_id])
    co_host = relationship("User", foreign_keys=[co_host_id])
    rsvps = relationship("RSVP", back_populates="match", cascade="all, delete-orphan")


class MatchSeries(Base):
    """A recurring weekly/biweekly slot. The background scheduler generates the next
    Match a few days ahead of `next_start`, then advances `next_start` by `interval_days`."""

    __tablename__ = "match_series"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    city = Column(String, nullable=True)
    address = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    skill_level = Column(String, nullable=True)
    max_players = Column(Integer, nullable=True)
    recurrence = Column(String, nullable=False)  # "Weekly" or "Biweekly"
    interval_days = Column(Integer, nullable=False)  # 7 or 14
    duration_minutes = Column(Integer, nullable=True)
    next_start = Column(DateTime, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    co_host_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    host = relationship("User", foreign_keys=[host_id])
    co_host = relationship("User", foreign_keys=[co_host_id])


class RSVP(Base):
    __tablename__ = "rsvps"
    __table_args__ = (UniqueConstraint("match_id", "user_id", name="uq_match_user"),)

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    waitlisted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    match = relationship("Match", back_populates="rsvps")
    user = relationship("User", foreign_keys=[user_id])


class MatchMessage(Base):
    __tablename__ = "match_messages"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    sender = relationship("User", foreign_keys=[sender_id])


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("match_id", "rater_id", "ratee_id", name="uq_match_rater_ratee"),)

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id"), nullable=False)
    rater_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ratee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sportsmanship = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_blocker_blocked"),)

    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    blocked_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    blocked_user = relationship("User", foreign_keys=[blocked_id])


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reported_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    reporter = relationship("User", foreign_keys=[reporter_id])
    reported = relationship("User", foreign_keys=[reported_id])


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    address = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    format = Column(String, nullable=False)  # "single_elim" | "round_robin"
    skill_level = Column(String, nullable=True)
    start_date = Column(DateTime, nullable=True)
    team_size = Column(Integer, nullable=False, default=6)
    max_teams = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="registration")  # registration | in_progress | completed
    created_at = Column(DateTime, default=datetime.utcnow)

    host = relationship("User", foreign_keys=[host_id])
    teams = relationship("TournamentTeam", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("TournamentMatch", back_populates="tournament", cascade="all, delete-orphan")


class TournamentTeam(Base):
    __tablename__ = "tournament_teams"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String, nullable=False)
    captain_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    tournament = relationship("Tournament", back_populates="teams")
    captain = relationship("User", foreign_keys=[captain_id])
    members = relationship("TournamentTeamMember", back_populates="team", cascade="all, delete-orphan")


class TournamentTeamMember(Base):
    __tablename__ = "tournament_team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_user"),)

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("tournament_teams.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    team = relationship("TournamentTeam", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])


class TeamMessage(Base):
    __tablename__ = "team_messages"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("tournament_teams.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    sender = relationship("User", foreign_keys=[sender_id])


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=False)
    round = Column(Integer, nullable=False, default=0)
    bracket_position = Column(Integer, nullable=False, default=0)
    team_a_id = Column(Integer, ForeignKey("tournament_teams.id"), nullable=True)
    team_b_id = Column(Integer, ForeignKey("tournament_teams.id"), nullable=True)
    team_a_score = Column(Integer, nullable=True)
    team_b_score = Column(Integer, nullable=True)
    winner_team_id = Column(Integer, ForeignKey("tournament_teams.id"), nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | completed
    created_at = Column(DateTime, default=datetime.utcnow)

    tournament = relationship("Tournament", back_populates="matches")
    team_a = relationship("TournamentTeam", foreign_keys=[team_a_id])
    team_b = relationship("TournamentTeam", foreign_keys=[team_b_id])
    winner_team = relationship("TournamentTeam", foreign_keys=[winner_team_id])


class Venue(Base):
    """A physical open-gym location, found-or-created by its normalized address so reviews
    from different matches/hosts held at the same place accumulate against one record."""

    __tablename__ = "venues"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String, nullable=False, index=True)
    address_key = Column(String, nullable=False, unique=True, index=True)  # lowercased/trimmed lookup key
    city = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    reviews = relationship("VenueReview", back_populates="venue", cascade="all, delete-orphan")


class VenueReview(Base):
    __tablename__ = "venue_reviews"
    __table_args__ = (UniqueConstraint("venue_id", "user_id", name="uq_venue_user"),)

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    body = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    venue = relationship("Venue", back_populates="reviews")
    user = relationship("User", foreign_keys=[user_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)
    message = Column(String, nullable=False)
    related_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    related_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    related_tournament_id = Column(Integer, ForeignKey("tournaments.id"), nullable=True)
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class PushToken(Base):
    __tablename__ = "push_tokens"
    __table_args__ = (UniqueConstraint("user_id", "token", name="uq_user_token"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
