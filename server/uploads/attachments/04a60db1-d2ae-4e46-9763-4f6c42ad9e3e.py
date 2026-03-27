"""
Unified User Knowledge Database Abstraction Layer.

Provides a unified interface for PostgreSQL-only persistence.

This database tracks user interactions, preferences, and analytics.

Usage:
    from db.user_knowledge import UserKnowledgeDB, InteractionType
    
    await UserKnowledgeDB.connect()
    await UserKnowledgeDB.log_interaction(user_id, event_type)
    await UserKnowledgeDB.disconnect()
"""

from typing import Optional, Dict, Any, List
from enum import Enum
from config.settings import settings


class InteractionType(str, Enum):
    """Types of user interactions we track."""
    # Swipe events
    SWIPE_LEFT = "swipe_left"
    SWIPE_RIGHT = "swipe_right"
    SWIPE_SUPER = "swipe_super"
    
    # Detail view events
    DETAIL_OPEN = "detail_open"
    DETAIL_CLOSE = "detail_close"
    
    # Navigation events
    CATEGORY_VIEW = "category_view"
    SCREEN_VIEW = "screen_view"
    
    # Search events
    SEARCH = "search"
    SEARCH_SUBMIT = "search_submit"
    SEARCH_RESULTS_VIEW = "search_results_view"
    SEARCH_RESULT_CLICK = "search_result_click"
    FILTER_APPLY = "filter_apply"
    FILTER_CLEAR = "filter_clear"
    
    # Engagement events
    SHARE = "share"
    SAVE = "save"
    FAVORITE_ADD = "favorite_add"
    FAVORITE_REMOVE = "favorite_remove"
    BOOKMARK_ADD = "bookmark_add"
    BOOKMARK_REMOVE = "bookmark_remove"
    PLACE_CARD_TAP = "place_card_tap"
    
    # CTA events
    CTA_DIRECTIONS = "cta_directions"
    CTA_CALL = "cta_call"
    CTA_WEBSITE = "cta_website"
    CTA_SHARE = "cta_share"
    
    # Rich content events
    TIP_EXPAND = "tip_expand"
    PHOTO_SWIPE = "photo_swipe"
    MAP_OPEN = "map_open"
    
    # Session events
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    
    # Impression events
    PLACE_IMPRESSION = "place_impression"
    DECK_SERVED = "deck_served"
    DISCOVER_FEED_SERVED = "discover_feed_served"
    DISCOVER_LOCATION = "discover_location"
    
    # Group swipe events
    GROUP_CREATE = "group_create"
    GROUP_INVITE_SENT = "group_invite_sent"
    GROUP_INVITE_RESPOND = "group_invite_respond"
    GROUP_START = "group_start"
    GROUP_DECK_SERVED = "group_deck_served"
    GROUP_SWIPE = "group_swipe"
    GROUP_MATCH = "group_match"
    GROUP_COMPLETE = "group_complete"
    
    # AI assistant events
    AI_CHAT_MESSAGE = "ai_chat_message"
    AI_RECOMMENDATION_SHOWN = "ai_recommendation_shown"
    AI_RECOMMENDATION_CLICK = "ai_recommendation_click"


class UserKnowledgeDB:
    """
    Unified knowledge database interface that delegates to PostgreSQL.
    """
    
    _backend = None
    _initialized = False
    # Only Postgres is supported
    _connection = None
    
    @classmethod
    def _get_backend(cls):
        """Get the PostgreSQL backend."""
        if not settings.use_postgres:
            raise RuntimeError("Postgres is required. Set USE_POSTGRES=true.")
        if cls._backend is None:
            from db.postgres import PostgresDB
            cls._backend = PostgresDB
            print("[UserKnowledgeDB] Using PostgreSQL backend")
        return cls._backend
    
    @classmethod
    async def connect(cls) -> None:
        """Connect to the knowledge database."""
        backend = cls._get_backend()
        # Ensure Postgres pool is initialized if needed
        if getattr(backend, "_pool", None) is None:
            await backend.connect()
        cls._initialized = True

    @classmethod
    def set_db_path(cls, path: str) -> None:
        """Postgres-only backend; ignore SQLite path in real DB mode."""
        if settings.use_postgres:
            # Tests may still call this; ignore to keep Postgres as source of truth.
            return
        raise RuntimeError("Postgres is required.")
    
    @classmethod
    async def disconnect(cls) -> None:
        """Disconnect from the knowledge database."""
        if cls._backend:
            await cls._backend.disconnect()
            cls._initialized = False
            cls._connection = None

    @classmethod
    async def merge_user_data(cls, source_user_id: str, target_user_id: str) -> Dict[str, Any]:
        """Merge knowledge data from source_user_id into target_user_id."""
        backend = cls._get_backend()
        if hasattr(backend, "merge_user_knowledge_data"):
            return await backend.merge_user_knowledge_data(source_user_id, target_user_id)
        return await backend.merge_user_data(source_user_id, target_user_id)
    
    # ==================== Interaction Logging ====================
    
    @classmethod
    async def log_interaction(
        cls,
        user_id: str,
        event_type: str,
        place_id: Optional[str] = None,
        duration_ms: Optional[int] = None,
        categories: Optional[List[str]] = None,
        metadata: Optional[str] = None,
        session_id: Optional[str] = None,
        client_event_id: Optional[str] = None,
        source: Optional[str] = None,
        surface: Optional[str] = None,
        position: Optional[int] = None,
        batch_id: Optional[str] = None,
        device_info: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None
    ) -> int:
        """Log a user interaction event."""
        return await cls._get_backend().log_interaction(
            user_id=user_id,
            event_type=event_type,
            place_id=place_id,
            duration_ms=duration_ms,
            categories=categories,
            metadata=metadata,
            session_id=session_id,
            client_event_id=client_event_id,
            source=source,
            surface=surface,
            position=position,
            batch_id=batch_id,
            device_info=device_info,
            lat=lat,
            lng=lng
        )

    @classmethod
    async def log_interactions_batch(
        cls,
        interactions: List[Dict[str, Any]],
    ) -> int:
        """Batch insert interaction events."""
        backend = cls._get_backend()
        if hasattr(backend, "log_interactions_batch"):
            return await backend.log_interactions_batch(interactions)
        # Fallback to individual inserts
        count = 0
        for interaction in interactions:
            await cls.log_interaction(**interaction)
            count += 1
        return count
    
    @classmethod
    async def log_interaction_batched(
        cls,
        user_id: str,
        event_type: str,
        place_id: Optional[str] = None,
        duration_ms: Optional[int] = None,
        categories: Optional[List[str]] = None,
        metadata: Optional[str] = None,
        session_id: Optional[str] = None,
        client_event_id: Optional[str] = None,
        source: Optional[str] = None,
        surface: Optional[str] = None,
        position: Optional[int] = None,
        batch_id: Optional[str] = None,
        device_info: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None
    ) -> None:
        """Log a user interaction using batch writer (non-blocking)."""
        # For PostgreSQL, use log_interaction directly (connection pooling handles concurrency)
        if settings.use_postgres:
            await cls.log_interaction(
                user_id, event_type, place_id, duration_ms, categories, metadata,
                session_id, client_event_id, source, surface, position, batch_id, device_info, lat, lng
            )
        else:
            await cls._get_backend().log_interaction_batched(
                user_id, event_type, place_id, duration_ms, categories, metadata,
                session_id, client_event_id, source, surface, position, batch_id, device_info, lat, lng
            )
    
    @classmethod
    async def log_place_impressions(cls, impressions: List[Dict[str, Any]]) -> int:
        """Batch insert place impressions."""
        return await cls._get_backend().log_place_impressions(impressions)

    @classmethod
    async def get_impression_stats(
        cls,
        surface: Optional[str] = None,
        algorithm: Optional[str] = None,
        days: int = 7,
    ) -> Dict[str, Any]:
        """Get impression stats (CTR, dwell, conversion)."""
        backend = cls._get_backend()
        if hasattr(backend, "get_impression_stats"):
            return await backend.get_impression_stats(surface=surface, algorithm=algorithm, days=days)
        return {}

    @classmethod
    async def get_position_bias(
        cls,
        surface: str,
        days: int = 7,
    ) -> List[Dict[str, Any]]:
        """Get position bias data (CTR by position) for a surface."""
        backend = cls._get_backend()
        if hasattr(backend, "get_position_bias"):
            return await backend.get_position_bias(surface=surface, days=days)
        return []

    @classmethod
    async def get_event_timeseries(
        cls,
        days: int = 30,
        event_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Get event counts grouped by day and event type."""
        backend = cls._get_backend()
        if hasattr(backend, "get_event_timeseries"):
            return await backend.get_event_timeseries(days=days, event_types=event_types)
        return []

    @classmethod
    async def get_feed_section_stats(cls, days: int = 7) -> List[Dict[str, Any]]:
        """Get feed section counts and unique place stats."""
        backend = cls._get_backend()
        if hasattr(backend, "get_feed_section_stats"):
            return await backend.get_feed_section_stats(days=days)
        return []

    @classmethod
    async def get_ctr_at_k(
        cls,
        user_id: str,
        k: int = 10,
        days: int = 7,
        surface: Optional[str] = None,
    ) -> float:
        backend = cls._get_backend()
        if hasattr(backend, "get_ctr_at_k"):
            return await backend.get_ctr_at_k(user_id=user_id, k=k, days=days, surface=surface)
        return 0.0

    @classmethod
    async def get_eval_at_k(
        cls,
        user_id: str,
        k: int = 10,
        days: int = 7,
        surface: Optional[str] = None,
    ) -> Dict[str, Any]:
        backend = cls._get_backend()
        if hasattr(backend, "get_eval_at_k"):
            return await backend.get_eval_at_k(user_id=user_id, k=k, days=days, surface=surface)
        return {"ctr_at_k": 0.0, "avg_dwell_at_k_ms": 0.0}

    @classmethod
    async def get_dwell_at_k(
        cls,
        user_id: str,
        k: int = 10,
        days: int = 7,
        surface: Optional[str] = None,
    ) -> float:
        backend = cls._get_backend()
        if hasattr(backend, "get_dwell_at_k"):
            return await backend.get_dwell_at_k(user_id=user_id, k=k, days=days, surface=surface)
        return 0.0

    @classmethod
    async def get_repeat_rate(
        cls,
        user_id: str,
        days: int = 7,
        surface: Optional[str] = None,
    ) -> float:
        backend = cls._get_backend()
        if hasattr(backend, "get_repeat_rate"):
            return await backend.get_repeat_rate(user_id=user_id, days=days, surface=surface)
        return 0.0
    
    # ==================== Category Stats ====================
    
    @classmethod
    async def update_category_stats(
        cls,
        user_id: str,
        category_id: str,
        like_delta: int = 0,
        skip_delta: int = 0,
        detail_open_delta: int = 0,
        dwell_ms_delta: int = 0
    ) -> None:
        """Update category statistics for a user."""
        await cls._get_backend().update_category_stats(
            user_id, category_id, like_delta, skip_delta, detail_open_delta, dwell_ms_delta
        )
    
    @classmethod
    async def update_category_stats_batch(
        cls,
        updates: List[Dict[str, Any]]
    ) -> int:
        """
        Batch update category statistics for multiple categories.
        
        Args:
            updates: List of dicts with keys: user_id, category_id, like_delta, skip_delta, detail_open_delta, dwell_ms_delta
            
        Returns:
            Number of updates processed
        """
        backend = cls._get_backend()
        if hasattr(backend, "update_category_stats_batch"):
            return await backend.update_category_stats_batch(updates)
        
        # Fallback to individual updates for backends without batch support
        for update in updates:
            await backend.update_category_stats(
                update["user_id"],
                update["category_id"],
                update.get("like_delta", 0),
                update.get("skip_delta", 0),
                update.get("detail_open_delta", 0),
                update.get("dwell_ms_delta", 0)
            )
        return len(updates)

    @classmethod
    async def update_place_interest_batch(
        cls,
        updates: List[Dict[str, Any]]
    ) -> int:
        """Batch update place interest tracking."""
        backend = cls._get_backend()
        if hasattr(backend, "update_place_interest_batch"):
            return await backend.update_place_interest_batch(updates)
        for update in updates:
            await backend.update_place_interest(
                update["user_id"],
                update["place_id"],
                update.get("view_delta", 0),
                update.get("detail_open_delta", 0),
                update.get("dwell_ms_delta", 0),
                update.get("swiped", False),
                update.get("swipe_direction"),
            )
        return len(updates)
    
    @classmethod
    async def get_category_stats(
        cls,
        user_id: str,
        min_interactions: int = 0,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Get category statistics for a user."""
        return await cls._get_backend().get_category_stats(user_id, min_interactions, limit=limit)

    @classmethod
    async def get_engaged_category_ids(
        cls,
        user_id: str,
        min_interactions: int = 0,
        limit: int = 10,
    ) -> List[str]:
        """Get top category IDs by engagement (lean payload)."""
        backend = cls._get_backend()
        if hasattr(backend, "get_engaged_category_ids"):
            return await backend.get_engaged_category_ids(
                user_id=user_id,
                min_interactions=min_interactions,
                limit=limit,
            )
        rows = await backend.get_category_stats(
            user_id,
            min_interactions,
            limit=limit,
        )
        return [row.get("category_id") for row in rows if row.get("category_id")]

    @classmethod
    async def get_category_stats_count(
        cls,
        user_id: str,
        min_interactions: int = 0,
    ) -> int:
        """Get total count of category stats for a user."""
        backend = cls._get_backend()
        if hasattr(backend, "get_category_stats_count"):
            return await backend.get_category_stats_count(user_id, min_interactions)
        return 0
    
    # ==================== Preferences ====================
    
    @classmethod
    async def get_user_preference_summary(
        cls,
        user_id: str,
        include_opened_place_ids: bool = True,
    ) -> Dict[str, Any]:
        """Get or compute user preference summary."""
        return await cls._get_backend().get_user_preference_summary(
            user_id,
            include_opened_place_ids=include_opened_place_ids,
        )

    @classmethod
    async def get_active_user_ids(
        cls,
        days: int = 30,
        limit: int = 5000,
    ) -> List[str]:
        """Get active user IDs within a time window."""
        backend = cls._get_backend()
        if hasattr(backend, "get_active_user_ids"):
            return await backend.get_active_user_ids(days=days, limit=limit)
        return []

    @classmethod
    async def get_place_engagement_stats(
        cls,
        days: int = 7,
        limit: int = 100000,
    ) -> List[Dict[str, Any]]:
        """Get aggregated engagement stats per place."""
        backend = cls._get_backend()
        if hasattr(backend, "get_place_engagement_stats"):
            return await backend.get_place_engagement_stats(days=days, limit=limit)
        return []
    
    # ==================== Feed History ====================
    
    @classmethod
    async def mark_places_shown(
        cls,
        user_id: str,
        place_ids: List[str],
        section: str = "discover"
    ) -> None:
        """Mark places as shown to user in a feed."""
        await cls._get_backend().mark_places_shown(user_id, place_ids, section)

    @classmethod
    async def log_shown_places(
        cls,
        user_id: str,
        place_ids: List[str],
        section: str = "discover"
    ) -> None:
        """Backward-compatible alias for marking shown places."""
        backend = cls._get_backend()
        if hasattr(backend, "log_shown_places"):
            await backend.log_shown_places(user_id, place_ids, section)
            return
        await backend.mark_places_shown(user_id, place_ids, section)
    
    @classmethod
    async def get_recently_shown_places(
        cls,
        user_id: str,
        hours: int = 24,
        section: Optional[str] = None
    ) -> List[str]:
        """Get place IDs shown to user recently."""
        backend = cls._get_backend()
        if hasattr(backend, "get_recently_shown_places"):
            return await backend.get_recently_shown_places(user_id, hours, section)
        if hasattr(backend, "get_recently_shown_ids"):
            return await backend.get_recently_shown_ids(user_id, hours)
        return []

    @classmethod
    async def get_recently_shown_ids(
        cls,
        user_id: str,
        hours: int = 24
    ) -> List[str]:
        """Backward-compatible alias for recently shown place IDs."""
        backend = cls._get_backend()
        if hasattr(backend, "get_recently_shown_ids"):
            return await backend.get_recently_shown_ids(user_id, hours)
        return await backend.get_recently_shown_places(user_id, hours, None)

    @classmethod
    async def update_user_preferences(
        cls,
        user_id: str,
        liked_places: Optional[List[Dict[str, Any]]] = None,
        skipped_places: Optional[List[Dict[str, Any]]] = None
    ) -> None:
        """Update derived user preference summary."""
        backend = cls._get_backend()
        if hasattr(backend, "update_user_preferences"):
            await backend.update_user_preferences(
                user_id=user_id,
                liked_places=liked_places or [],
                skipped_places=skipped_places or [],
            )

    @classmethod
    async def log_impressions_batch(
        cls,
        user_id: str,
        places: List[Dict[str, Any]],
        surface: str,
        batch_id: str,
        algorithm: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> int:
        """Backward-compatible alias for batch impression logging."""
        backend = cls._get_backend()
        if hasattr(backend, "log_impressions_batch"):
            return await backend.log_impressions_batch(
                user_id=user_id,
                places=places,
                surface=surface,
                batch_id=batch_id,
                algorithm=algorithm,
                session_id=session_id,
            )
        # Fall back to per-impression logging if needed
        await cls.log_place_impressions([
            {
                "user_id": user_id,
                "place_id": p.get("place_id") or p.get("_id"),
                "surface": surface,
                "position": p.get("position"),
                "batch_id": batch_id,
                "algorithm": algorithm,
                "score": p.get("score"),
                "session_id": session_id,
            }
            for p in places
            if p.get("place_id") or p.get("_id")
        ])
        return len(places)
    
    # ==================== Place Interest ====================
    
    @classmethod
    async def update_place_interest(
        cls,
        user_id: str,
        place_id: str,
        view_delta: int = 0,
        detail_open_delta: int = 0,
        dwell_ms_delta: int = 0,
        swiped: bool = False,
        swipe_direction: Optional[str] = None
    ) -> None:
        """Update place interest tracking for a user."""
        await cls._get_backend().update_place_interest(
            user_id, place_id, view_delta, detail_open_delta,
            dwell_ms_delta, swiped, swipe_direction
        )

    @classmethod
    async def get_place_dwell_ms(cls, user_id: str, place_id: str) -> int:
        """Get total dwell time for a user-place pair."""
        backend = cls._get_backend()
        if hasattr(backend, "get_place_dwell_ms"):
            return await backend.get_place_dwell_ms(user_id, place_id)
        return 0

    @classmethod
    async def get_dwell_place_ids(
        cls,
        user_id: str,
        min_dwell_ms: int = 30000,
    ) -> List[str]:
        """Get place IDs where user dwell exceeded threshold."""
        backend = cls._get_backend()
        if hasattr(backend, "get_dwell_place_ids"):
            return await backend.get_dwell_place_ids(user_id, min_dwell_ms=min_dwell_ms)
        return []

    @classmethod
    async def get_locality_affinity(
        cls,
        user_id: str,
        min_interactions: int = 3,
    ) -> Dict[str, float]:
        """Get locality affinity (like rate) for a user."""
        backend = cls._get_backend()
        if hasattr(backend, "get_locality_affinity"):
            return await backend.get_locality_affinity(user_id, min_interactions=min_interactions)
        return {}
    
    @classmethod
    async def update_impression_click(
        cls,
        user_id: str,
        place_id: str,
        batch_id: Optional[str] = None
    ) -> None:
        """Update impression to mark it as clicked."""
        backend = cls._get_backend()
        if hasattr(backend, "update_impression_click"):
            await backend.update_impression_click(user_id, place_id, batch_id)

    @classmethod
    async def update_impression_click_batch(
        cls,
        updates: List[Dict[str, Any]],
    ) -> int:
        """Batch update impressions to mark them as clicked."""
        if not updates:
            return 0
        backend = cls._get_backend()
        if hasattr(backend, "update_impression_click_batch"):
            return await backend.update_impression_click_batch(updates)
        for update in updates:
            await cls.update_impression_click(
                update.get("user_id"),
                update.get("place_id"),
                update.get("batch_id"),
            )
        return len(updates)

    @classmethod
    async def update_impression_dwell(
        cls,
        user_id: str,
        place_id: str,
        dwell_ms: int,
        batch_id: Optional[str] = None,
    ) -> None:
        """Update impression to record dwell time."""
        backend = cls._get_backend()
        if hasattr(backend, "update_impression_dwell"):
            await backend.update_impression_dwell(user_id, place_id, dwell_ms, batch_id)

    @classmethod
    async def update_impression_dwell_batch(
        cls,
        updates: List[Dict[str, Any]],
    ) -> int:
        """Batch update impressions to record dwell time."""
        if not updates:
            return 0
        backend = cls._get_backend()
        if hasattr(backend, "update_impression_dwell_batch"):
            return await backend.update_impression_dwell_batch(updates)
        for update in updates:
            await cls.update_impression_dwell(
                update.get("user_id"),
                update.get("place_id"),
                update.get("dwell_ms", 0),
                update.get("batch_id"),
            )
        return len(updates)
    
    @classmethod
    async def update_impression_conversion(
        cls,
        user_id: str,
        place_id: str
    ) -> None:
        """Update impression to mark it as converted."""
        backend = cls._get_backend()
        if hasattr(backend, "update_impression_conversion"):
            await backend.update_impression_conversion(user_id, place_id)
    
    @classmethod
    async def get_user_interactions(
        cls,
        user_id: str,
        limit: int = 100,
        event_type: Optional[str] = None,
        event_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent user interactions."""
        backend = cls._get_backend()
        if hasattr(backend, "get_user_interactions"):
            if event_types is None and event_type is not None:
                event_types = [event_type]
            # Always use keyword args to avoid signature mismatches
            return await backend.get_user_interactions(
                user_id=user_id,
                event_types=event_types,
                limit=limit,
            )
        return []

    @classmethod
    async def get_session_interactions(
        cls,
        user_id: str,
        session_id: str,
        limit: int = 50,
        event_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent interactions for a specific session."""
        backend = cls._get_backend()
        if hasattr(backend, "get_session_interactions"):
            return await backend.get_session_interactions(
                user_id=user_id,
                session_id=session_id,
                limit=limit,
                event_types=event_types,
            )
        return []

    @classmethod
    async def get_session_context_events(
        cls,
        user_id: str,
        session_id: str,
        limit: int = 50,
        event_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent session interactions with only categories + metadata."""
        backend = cls._get_backend()
        if hasattr(backend, "get_session_context_events"):
            return await backend.get_session_context_events(
                user_id=user_id,
                session_id=session_id,
                limit=limit,
                event_types=event_types,
            )
        rows = await cls.get_session_interactions(
            user_id=user_id,
            session_id=session_id,
            limit=limit,
            event_types=event_types,
        )
        return [
            {"categories": row.get("categories"), "metadata": row.get("metadata")}
            for row in rows
        ]

    @classmethod
    async def get_recent_interactions(
        cls,
        limit: int = 50,
        event_types: Optional[List[str]] = None,
        exclude_user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent interactions across users."""
        backend = cls._get_backend()
        if hasattr(backend, "get_recent_interactions"):
            return await backend.get_recent_interactions(
                limit=limit,
                event_types=event_types,
                exclude_user_id=exclude_user_id,
            )
        return []

    @classmethod
    async def get_place_interactions(
        cls,
        user_id: str,
        place_id: str,
        limit: int = 50,
        event_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent interactions for a specific place."""
        backend = cls._get_backend()
        if hasattr(backend, "get_place_interactions"):
            return await backend.get_place_interactions(
                user_id=user_id,
                place_id=place_id,
                event_types=event_types,
                limit=limit,
            )
        # Fallback: fetch user interactions and filter
        interactions = await cls.get_user_interactions(
            user_id=user_id,
            event_types=event_types,
            limit=max(limit * 3, 100),
        )
        filtered = [i for i in interactions if i.get("place_id") == place_id]
        return filtered[:limit]

    @classmethod
    async def get_category_affinity_vector(cls, user_id: str) -> Dict[str, float]:
        backend = cls._get_backend()
        if hasattr(backend, "get_category_affinity_vector"):
            return await backend.get_category_affinity_vector(user_id)
        return {}

    @classmethod
    async def get_preferred_categories(
        cls,
        user_id: str,
        top_k: int = 5,
        min_score: float = 0.3,
    ) -> List[str]:
        backend = cls._get_backend()
        if hasattr(backend, "get_preferred_categories"):
            return await backend.get_preferred_categories(user_id, top_k=top_k, min_score=min_score)
        return []

    @classmethod
    async def get_avoided_categories(
        cls,
        user_id: str,
        top_k: int = 5,
        max_score: float = -0.3,
    ) -> List[str]:
        backend = cls._get_backend()
        if hasattr(backend, "get_avoided_categories"):
            return await backend.get_avoided_categories(user_id, top_k=top_k, max_score=max_score)
        return []

    @classmethod
    async def get_places_with_interest(
        cls,
        user_id: str,
        min_opens: int = 1,
        not_swiped: bool = False,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        backend = cls._get_backend()
        if hasattr(backend, "get_places_with_interest"):
            return await backend.get_places_with_interest(
                user_id=user_id,
                min_opens=min_opens,
                not_swiped=not_swiped,
                limit=limit,
            )
        return []

    @classmethod
    async def get_interest_place_ids(
        cls,
        user_id: str,
        min_opens: int = 1,
        not_swiped: bool = False,
        limit: int = 20,
    ) -> List[str]:
        backend = cls._get_backend()
        if hasattr(backend, "get_interest_place_ids"):
            return await backend.get_interest_place_ids(
                user_id=user_id,
                min_opens=min_opens,
                not_swiped=not_swiped,
                limit=limit,
            )
        rows = await cls.get_places_with_interest(
            user_id=user_id,
            min_opens=min_opens,
            not_swiped=not_swiped,
            limit=limit,
        )
        return [row.get("place_id") for row in rows if row.get("place_id")]

    @classmethod
    async def get_opened_place_ids(cls, user_id: str) -> List[str]:
        backend = cls._get_backend()
        if hasattr(backend, "get_opened_place_ids"):
            return await backend.get_opened_place_ids(user_id)
        return []

    # ==================== Profile Insights Helpers ====================

    @classmethod
    async def get_user_activity_summary(
        cls,
        user_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        backend = cls._get_backend()
        if hasattr(backend, "get_user_activity_summary"):
            return await backend.get_user_activity_summary(user_id, days=days)
        return {"active_days": 0, "sessions": 0, "last_active_at": None}

    @classmethod
    async def get_time_preferences(
        cls,
        user_id: str,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        backend = cls._get_backend()
        if hasattr(backend, "get_time_preferences"):
            return await backend.get_time_preferences(user_id, limit=limit)
        return []

    @classmethod
    async def get_surface_mix(
        cls,
        user_id: str,
        days: int = 30,
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        backend = cls._get_backend()
        if hasattr(backend, "get_surface_mix"):
            return await backend.get_surface_mix(user_id, days=days, limit=limit)
        return []

    @classmethod
    async def get_user_cta_counts(
        cls,
        user_id: str,
        days: int = 90,
    ) -> Dict[str, int]:
        backend = cls._get_backend()
        if hasattr(backend, "get_user_cta_counts"):
            return await backend.get_user_cta_counts(user_id, days=days)
        return {}

    @classmethod
    async def get_user_search_themes(
        cls,
        user_id: str,
        limit: int = 5,
        days: int = 180,
    ) -> Dict[str, List[Dict[str, Any]]]:
        backend = cls._get_backend()
        if hasattr(backend, "get_user_search_themes"):
            return await backend.get_user_search_themes(user_id, limit=limit, days=days)
        return {"top_queries": [], "top_filters": []}

    @classmethod
    async def get_user_locality_affinity(
        cls,
        user_id: str,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        backend = cls._get_backend()
        if hasattr(backend, "get_user_locality_affinity"):
            return await backend.get_user_locality_affinity(user_id, limit=limit)
        return []

    @classmethod
    async def get_user_place_engagement(
        cls,
        user_id: str,
        limit: int = 8,
        min_dwell_ms: Optional[int] = None,
        min_opens: Optional[int] = None,
        include_swiped: bool = True,
    ) -> List[Dict[str, Any]]:
        backend = cls._get_backend()
        if hasattr(backend, "get_user_place_engagement"):
            return await backend.get_user_place_engagement(
                user_id=user_id,
                limit=limit,
                min_dwell_ms=min_dwell_ms,
                min_opens=min_opens,
                include_swiped=include_swiped,
            )
        return []

    # ==================== Maintenance ====================

    @classmethod
    async def run_cleanup(
        cls,
        interaction_days: int = 90,
        feed_history_days: int = 7,
    ) -> Dict[str, int]:
        backend = cls._get_backend()
        if hasattr(backend, "run_cleanup"):
            return await backend.run_cleanup(
                interaction_days=interaction_days,
                feed_history_days=feed_history_days,
            )
        return {}

    @classmethod
    async def get_database_stats(cls) -> Dict[str, Any]:
        backend = cls._get_backend()
        if hasattr(backend, "get_database_stats"):
            return await backend.get_database_stats()
        return {}
