--
-- PostgreSQL database dump
--

\restrict 3R2F8m8pARXxa1tP0eSkZs6RqcttWHW6wcYcSeZ34jZ73Euk679LGCNFsA27OB3

-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: asset_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_status AS ENUM (
    'draft',
    'active',
    'deprecated',
    'archived'
);


--
-- Name: asset_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_visibility AS ENUM (
    'public',
    'internal',
    'private'
);


--
-- Name: delivery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.delivery_status AS ENUM (
    'initialized',
    'pending',
    'planning',
    'active',
    'completed',
    'archived',
    'canceled',
    'in_progress',
    'overdue',
    'blocked'
);


--
-- Name: deployment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deployment_status AS ENUM (
    'pending',
    'deploying',
    'deployed',
    'failed',
    'rolled_back'
);


--
-- Name: environment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.environment AS ENUM (
    'dev',
    'stage',
    'prod'
);


--
-- Name: initiative_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.initiative_status AS ENUM (
    'planning',
    'active',
    'paused',
    'completed'
);


--
-- Name: issue_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.issue_severity AS ENUM (
    'critical',
    'major',
    'minor',
    'trivial'
);


--
-- Name: issue_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.issue_status AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed',
    'deferred'
);


--
-- Name: item_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: item_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_status AS ENUM (
    'backlog',
    'ready',
    'in_progress',
    'done',
    'archived',
    'drafted',
    'initialized',
    'completed'
);


--
-- Name: item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_type AS ENUM (
    'feature',
    'bug',
    'improvement',
    'research',
    'request'
);


--
-- Name: release_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.release_status AS ENUM (
    'draft',
    'planned',
    'in_progress',
    'completed',
    'failed'
);


--
-- Name: release_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.release_type AS ENUM (
    'feature',
    'hotfix',
    'patch'
);


--
-- Name: target_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.target_status AS ENUM (
    'pending',
    'deploying',
    'deployed',
    'failed'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'created',
    'assigned',
    'in_progress',
    'in_review',
    'done',
    'overdue',
    'blocked',
    'archived'
);


--
-- Name: task_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_type AS ENUM (
    'design',
    'development',
    'testing',
    'review',
    'research',
    'fix',
    'documentation',
    'deployment'
);


--
-- Name: test_cycle_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.test_cycle_status AS ENUM (
    'planned',
    'in_progress',
    'completed',
    'archived'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'admin',
    'product_admin',
    'product_manager',
    'business_analyst',
    'developer',
    'viewer'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product character varying(255) NOT NULL,
    user_id uuid,
    user_name character varying(255) NOT NULL,
    user_avatar character varying(500),
    action character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    entity_title character varying(255) NOT NULL,
    changes json,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_asset_id uuid NOT NULL,
    target_asset_id uuid NOT NULL,
    relation_type character varying(50) DEFAULT 'related_to'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    category character varying(100) DEFAULT 'business'::character varying NOT NULL,
    icon character varying(50),
    color character varying(20),
    product_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id character varying(255) NOT NULL,
    asset_type_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(255),
    description text,
    content text,
    status public.asset_status DEFAULT 'draft'::public.asset_status NOT NULL,
    visibility public.asset_visibility DEFAULT 'internal'::public.asset_visibility NOT NULL,
    owner_user_id uuid,
    tags text[],
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: backlog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backlog_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    type public.item_type DEFAULT 'feature'::public.item_type NOT NULL,
    priority public.item_priority DEFAULT 'medium'::public.item_priority NOT NULL,
    status public.item_status DEFAULT 'backlog'::public.item_status NOT NULL,
    product character varying(255) DEFAULT 'Product'::character varying NOT NULL,
    initiative character varying(255),
    delivery character varying(255),
    owner character varying(255),
    estimate character varying(50),
    acceptance_criteria text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_avatar character varying(500)
);


--
-- Name: deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    start_date date,
    end_date date,
    status text DEFAULT 'initialized'::public.delivery_status NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: delivery_initiatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_initiatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_id uuid NOT NULL,
    initiative_id uuid NOT NULL
);


--
-- Name: deployment_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deployment_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_deployment_id uuid NOT NULL,
    server_id uuid NOT NULL,
    status public.target_status DEFAULT 'pending'::public.target_status NOT NULL,
    deployed_at timestamp without time zone,
    failed_at timestamp without time zone,
    logs_url character varying(1000)
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    product_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: initiatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.initiatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    status public.initiative_status DEFAULT 'planning'::public.initiative_status NOT NULL,
    period character varying(100),
    leader character varying(255),
    priority public.item_priority DEFAULT 'medium'::public.item_priority NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    period_start date,
    period_end date,
    product character varying(255) DEFAULT 'Product'::character varying NOT NULL,
    leader_avatar character varying(500)
);


--
-- Name: product_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product character varying(255) NOT NULL,
    user_id uuid NOT NULL,
    role character varying(50) DEFAULT 'member'::character varying NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    logo character varying(500),
    description text,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: release_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    deployment_order integer,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by_user_id uuid
);


--
-- Name: release_deployments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_deployments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_id uuid NOT NULL,
    environment public.environment NOT NULL,
    sequence integer NOT NULL,
    status public.deployment_status DEFAULT 'pending'::public.deployment_status NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    failed_at timestamp without time zone,
    deployed_by_user_id uuid,
    notes text
);


--
-- Name: releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50),
    version character varying(50),
    title character varying(255) NOT NULL,
    status public.release_status DEFAULT 'draft'::public.release_status NOT NULL,
    release_type public.release_type DEFAULT 'feature'::public.release_type NOT NULL,
    planned_at timestamp without time zone,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_by_user_id uuid NOT NULL,
    release_manager_id uuid,
    notes text,
    release_notes text,
    product_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: servers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    environment public.environment NOT NULL,
    host character varying(500),
    port integer,
    protocol character varying(20),
    region character varying(100),
    provider character varying(100),
    instance_id character varying(255),
    is_active integer DEFAULT 1 NOT NULL,
    product_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    story_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    file_name character varying(500) NOT NULL,
    file_size integer NOT NULL,
    mime_type character varying(255) NOT NULL,
    file_path character varying(1000) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    product_id character varying(255) NOT NULL,
    from_status public.task_status,
    to_status public.task_status NOT NULL,
    changed_by_user_id uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id character varying(255) NOT NULL,
    initiative_id uuid,
    item_id uuid NOT NULL,
    delivery_id uuid,
    title character varying(255) NOT NULL,
    description text,
    status public.task_status DEFAULT 'created'::public.task_status NOT NULL,
    priority public.task_priority DEFAULT 'medium'::public.task_priority NOT NULL,
    type public.task_type,
    assignee_user_ids uuid[],
    created_by_user_id uuid NOT NULL,
    estimate_value integer,
    dependent uuid[],
    blocked_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    due_at timestamp without time zone,
    owner_user_id uuid,
    reviewer_user_ids uuid[]
);


--
-- Name: test_cycle_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_cycle_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_cycle_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    severity public.issue_severity DEFAULT 'minor'::public.issue_severity NOT NULL,
    status public.issue_status DEFAULT 'open'::public.issue_status NOT NULL,
    story_id uuid,
    reported_by_user_id uuid NOT NULL,
    assigned_to_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: test_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    status public.test_cycle_status DEFAULT 'planned'::public.test_cycle_status NOT NULL,
    delivery_id uuid,
    release_id uuid,
    product_id character varying(255) NOT NULL,
    start_date date,
    end_date date,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    key character varying(100) NOT NULL,
    value json NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    role public.user_role DEFAULT 'viewer'::public.user_role NOT NULL,
    avatar character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Data for Name: activities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.activities (id, product, user_id, user_name, user_avatar, action, entity_type, entity_id, entity_title, changes, created_at) FROM stdin;
d7f3dde9-3d9c-4300-a368-2246922b9d44	Traderverse	\N	System	\N	updated	story	34d36cc8-0181-4f8a-9f81-f1e5d4802fb2	Research GDPR compliance requirements	[{"field":"type","from":"feature","to":"bug"}]	2026-03-16 10:46:43.383098-04
98accd81-0c89-47c1-8fc9-4b547853fc6d	Traderverse	\N	System	\N	updated	story	34d36cc8-0181-4f8a-9f81-f1e5d4802fb2	Research GDPR compliance requirements	[{"field":"type","from":"bug","to":"feature"}]	2026-03-16 10:46:44.617622-04
123cf31d-104a-4287-b6f0-428503160042	Traderverse	\N	System	\N	updated	story	34d36cc8-0181-4f8a-9f81-f1e5d4802fb2	Research GDPR compliance requirements	[{"field":"type","from":"feature","to":"improvement"}]	2026-03-16 11:09:20.830585-04
a9c8c9c0-8dfe-41c4-b38f-34a75d5193d6	Traderverse	\N	System	\N	updated	story	34d36cc8-0181-4f8a-9f81-f1e5d4802fb2	Research GDPR compliance requirements	[{"field":"type","from":"improvement","to":"feature"}]	2026-03-16 11:09:24.906975-04
3edb5964-48b3-4adc-973f-b12b8e867f6d	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"type","from":null,"to":"design"}]	2026-03-16 12:06:17.141955-04
c05ab593-e490-4f00-af2c-d6d48749cb6f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	e8adf32b-f441-4ae1-af26-9c4bcf3ea0c3	Add responsive hamburger menu	[{"field":"type","from":null,"to":"development"}]	2026-03-16 12:06:23.551184-04
108d52d0-3dd5-4d44-9a5c-d68ea187c681	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	ee620d60-ed8e-4f2c-baa3-8c78ebc6878e	Test mobile navigation on iOS Safari	[{"field":"type","from":null,"to":"review"}]	2026-03-16 12:06:27.805989-04
852c72a8-a6df-42de-9161-afbf81ba0301	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"type","from":null,"to":"research"}]	2026-03-16 12:06:31.842018-04
5a090cf2-24ae-4382-936d-33c044ec35ae	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	3851590a-199f-4d29-b718-c67760dd7bd1	Add rate limit headers to API responses	[{"field":"type","from":null,"to":"research"}]	2026-03-16 12:08:44.376015-04
e1b3266b-14c7-48fb-80e0-a461b6350c3f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	a1cec26e-ce9d-406a-865d-066d659c0739	Fix email HTML template rendering	[{"field":"type","from":null,"to":"fix"}]	2026-03-16 12:08:50.49451-04
c1c91dbd-1bd5-4d2f-872e-125a0335f112	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	4d70223f-2b91-44be-8168-a650e96dcf42	Add email preview in admin panel	[{"field":"type","from":null,"to":"deployment"}]	2026-03-16 12:08:52.177724-04
52dc949a-c4d6-4669-a1b5-823fae913dba	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"type","from":null,"to":"documentation"}]	2026-03-16 12:08:53.999865-04
425b58ee-fab3-49a0-b9b1-89e159be2f84	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"type","from":null,"to":"documentation"}]	2026-03-16 12:08:56.093781-04
1f9db52b-1985-4c1f-9dfe-11d1e36eea59	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	6db740fc-6cee-4a2f-a006-20e2227f6d52	Add unit tests for cart calculations	[{"field":"type","from":null,"to":"documentation"}]	2026-03-16 12:18:30.459809-04
f6f6dbf5-3c48-4912-9173-189304fd1010	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"type","from":null,"to":"deployment"}]	2026-03-16 12:18:32.264508-04
c12441f8-6eb8-49e6-bedc-7bdc961ed222	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	772b419d-4ad0-4bd0-896f-759abab890e7	Design OAuth2 login flow mockups	[{"field":"type","from":null,"to":"fix"}]	2026-03-16 12:18:35.238638-04
bebc13b6-a459-4a55-a933-96126dff609a	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	bbc36c7d-6c05-40ab-a26f-d77640f986d2	Implement JWT refresh token rotation	[{"field":"type","from":null,"to":"fix"}]	2026-03-16 12:18:37.221556-04
681395bc-052a-4aaf-affd-cdd5630f06fa	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	07e14e97-c7d8-4325-8fd0-8017e0ea6de3	SnapTrade API integration testing	[{"field":"type","from":null,"to":"research"}]	2026-03-16 12:18:41.060828-04
b9886a16-a032-4fb0-9cf9-7429f197cf1a	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"dependent","from":null,"to":"e8adf32b-f441-4ae1-af26-9c4bcf3ea0c3"}]	2026-03-16 13:37:43.424467-04
f0948aef-f765-4cbe-afd3-5bf19283df09	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"dependent","from":null,"to":"8b920bf9-65df-4c67-ad05-3a622a846237"}]	2026-03-16 13:37:44.586857-04
727b4600-6e04-45c4-9b6f-3a183dd8627f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"assigned","to":"in_progress"}]	2026-03-16 13:39:48.562061-04
9cfbb1ad-8f20-473f-8eca-5c51ccd8eeb2	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	https://images.unsplash.com/photo-1544225917-1bf66feace19?w=200&h=200&fit=crop&crop=face	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"comment","from":null,"to":"why is. this no working"}]	2026-03-16 13:48:05.763939-04
553724b0-4006-47a2-84e4-ed4663739174	Traderverse	\N	System	\N	created	initiative	49ce317d-101c-4564-86d1-1f841df4f977	allow brokerage and exchange integrations	\N	2026-03-18 06:54:08.720667-04
56f5d7c8-aace-417c-be56-d1e6445ea4ad	Traderverse	\N	System	\N	updated	initiative	49ce317d-101c-4564-86d1-1f841df4f977	allow brokerage and exchange integrations	[{"field":"leader","from":null,"to":"Sarim Alavi"}]	2026-03-18 06:54:21.35383-04
a1b61fef-b84c-492a-b5b6-6e7f7c92ea2b	Traderverse	\N	System	\N	created	story	34d9c9d8-42b4-4076-a54c-52909ff304e7	Snap trade integration	\N	2026-03-18 06:55:56.351981-04
e237c9d9-88fc-4620-bb1c-e5f90899df6f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	56bfb6d1-2505-4280-89ab-40149c3d103b	create etrade test server	\N	2026-03-18 06:56:33.46682-04
d353a8b5-7138-4bae-8184-15693734df97	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	56bfb6d1-2505-4280-89ab-40149c3d103b	create etrade test server	[{"field":"comment","from":null,"to":"i this done ?"}]	2026-03-18 06:56:57.663718-04
0b7dd0c5-81d9-4d35-b45a-2b78a0923b2f	Traderverse	\N	System	\N	updated	initiative	49ce317d-101c-4564-86d1-1f841df4f977	allow brokerage and exchange integrations	[{"field":"description","from":"<p>we need allow 3 things with them.<br><br>1. Trade buttong<br>2. Export Timeline for them <br>3. Allow there widgets in side Traderverse</p>","to":"<h2><strong>Omnilink — Traderverse Integration Layer</strong></h2><p>Omnilink is Traderverse’s universal integration framework that connects financial platforms, applications, and communities into a single, interoperable ecosystem. It enables any brokerage, exchange, fintech app, or developer platform to seamlessly integrate with Traderverse—while also allowing Traderverse to embed and extend into external systems.</p><p>At its core, Omnilink removes fragmentation across the trading experience by unifying identity, data, and interaction layers across platforms.</p><hr><h3><strong>What Omnilink Enables</strong></h3><p>Omnilink allows partners to embed Traderverse components—such as social feeds, analytics, profiles, and community modules—directly into their own applications across web, mobile (iOS/Android), and desktop environments. At the same time, external tools, dashboards, and services can be embedded inside Traderverse, creating a fully bi-directional integration model.</p><p>It supports transaction-level connectivity by enabling users to initiate buy/sell actions through a unified interface, which are then routed to connected brokerages or exchanges. This ensures a seamless flow from discovery and discussion to execution, without forcing users to leave the ecosystem.</p><p>Omnilink also integrates with brokerages, exchanges, and crypto wallets to provide access to holdings, transaction history, and portfolio data. This creates a standardized data layer across traditionally siloed platforms.</p><hr><h3><strong>Identity &amp; User Continuity</strong></h3><p>A key component of Omnilink is its identity layer. Users can move across platforms with one-click single sign-on (SSO), whether entering Traderverse from a partner app or accessing external platforms from Traderverse. Their profile, preferences, subscriptions, and settings persist across all integrated environments, creating a continuous and personalized experience.</p><hr><h3><strong>Content &amp; Network Effects</strong></h3><p>Omnilink enables seamless content sharing both into and out of Traderverse. Insights, strategies, and discussions can be distributed across external platforms, while external content can be brought into the Traderverse ecosystem—amplifying reach, engagement, and network effects.</p><hr><h3><strong>Security &amp; Access Control</strong></h3><p>The framework supports secure integrations through public, private, and certificate-based access layers. This ensures that partners maintain full control over permissions, data access, and user interactions while operating within a shared ecosystem.</p><hr><h2><strong>Why It Matters</strong></h2><p>Today’s trading experience is fragmented—users research in one place, discuss in another, and execute elsewhere. Omnilink brings all of these layers together.</p><p>For partners, it means:</p><ul><li><p>Increased user engagement and retention</p></li><li><p>Access to a verified social and behavioral layer</p></li><li><p>New monetization opportunities through embedded modules and communities</p></li></ul><p>For users, it means:</p><ul><li><p>A unified identity across platforms</p></li><li><p>Seamless movement between discovery, learning, and execution</p></li><li><p>A more connected and intelligent trading experience</p></li></ul><hr><h2><strong>Positioning</strong></h2><p>Omnilink transforms Traderverse into the foundational infrastructure for the modern financial ecosystem—serving as the <strong>identity, data, and interaction layer</strong> across brokerages, exchanges, and financial applications.</p>"}]	2026-03-19 10:24:20.773277-04
9b74e494-c48e-4f11-932b-d5b54b50e070	Traderverse	\N	System	\N	updated	initiative	49ce317d-101c-4564-86d1-1f841df4f977	Omnilink Brokerage, Exchanges, Wallets, Apps Integratoin	[{"field":"title","from":"allow brokerage and exchange integrations","to":"Omnilink Brokerage, Exchanges, Wallets, Apps Integratoin"}]	2026-03-19 10:24:52.256314-04
82305db4-7689-4a09-b329-331102920cae	Traderverse	\N	System	\N	created	initiative	26aac803-31b9-4513-ad15-bf20e5f43f27	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	\N	2026-03-19 10:25:52.755045-04
4064ba7a-2a63-4112-815e-34bb2b22c013	Traderverse	\N	System	\N	updated	initiative	26aac803-31b9-4513-ad15-bf20e5f43f27	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	[{"field":"description","from":null,"to":"<h2><strong>Tradenion — Unified Community Integration Layer</strong></h2><p>Tradenion enables seamless integration with major communication and social platforms—including Discord, Telegram, Slack, WhatsApp, X (Twitter), LinkedIn, and Facebook—bringing fragmented trading communities into a single, structured ecosystem.</p><hr><h3><strong>What Tradenion Does</strong></h3><p>Tradenion connects external communities directly into Traderverse, allowing conversations, insights, signals, and user activity from platforms like Discord and Telegram to be ingested, organized, and enriched within a unified interface. This transforms scattered discussions into structured, searchable, and actionable intelligence.</p><hr><h3><strong>Core Capabilities</strong></h3><p><strong>1. Cross-Platform Community Aggregation</strong></p><ul><li><p>Integrates groups, channels, and conversations from:</p><ul><li><p>Discord, Telegram, Slack</p></li><li><p>WhatsApp communities</p></li><li><p>X (Twitter), LinkedIn, Facebook</p></li></ul></li><li><p>Centralizes all communication into one unified feed</p></li></ul><hr><p><strong>2. Structured Data Layer</strong></p><ul><li><p>Converts unstructured messages into:</p><ul><li><p>Trade ideas</p></li><li><p>Signals</p></li><li><p>Insights</p></li></ul></li><li><p>Tags content by:</p><ul><li><p>Asset (stocks, crypto, etc.)</p></li><li><p>Sentiment</p></li><li><p>User credibility</p></li></ul></li></ul><hr><p><strong>3. Identity &amp; Attribution</strong></p><ul><li><p>Maps external usernames to Traderverse profiles</p></li><li><p>Builds credibility scores based on cross-platform activity</p></li><li><p>Tracks influence and engagement across networks</p></li></ul><hr><p><strong>4. Real-Time Sync &amp; Engagement</strong></p><ul><li><p>Bi-directional flow:</p><ul><li><p>Pull external conversations into Traderverse</p></li><li><p>Push insights back to external platforms</p></li></ul></li><li><p>Enables users to interact without leaving their preferred platform</p></li></ul><hr><p><strong>5. Shareability &amp; Distribution</strong></p><ul><li><p>Publish Traderverse content directly to:</p><ul><li><p>Discord channels</p></li><li><p>Telegram groups</p></li><li><p>X threads, LinkedIn posts, Facebook groups</p></li></ul></li><li><p>Amplifies reach and virality</p></li></ul><hr><p><strong>6. Moderation &amp; Intelligence Layer</strong></p><ul><li><p>AI-powered filtering of:</p><ul><li><p>Spam</p></li><li><p>Low-quality signals</p></li><li><p>Scam activity</p></li></ul></li><li><p>Highlights high-value contributors and trending discussions</p></li></ul><hr><h2><strong>Why It Matters</strong></h2><p>Today, most trading activity happens outside of brokerages—across fragmented communities on Discord, Telegram, and social media. These platforms lack structure, credibility, and integration with actual trading workflows.</p><p>Tradenion bridges this gap by:</p><ul><li><p>Bringing community-driven insights into a structured environment</p></li><li><p>Enabling platforms to capture and monetize external engagement</p></li><li><p>Creating a unified social graph across all major communication channels</p></li></ul><hr><h2><strong>Positioning</strong></h2><p>Tradenion transforms Traderverse into the <strong>central intelligence and communication layer</strong> for global trading communities—connecting where traders already are and turning scattered conversations into actionable market insight.</p>"}]	2026-03-19 10:27:11.537303-04
f636e44e-86f2-4137-bd50-4e42c2c363ba	Traderverse	\N	System	\N	updated	initiative	26aac803-31b9-4513-ad15-bf20e5f43f27	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	[{"field":"periodStart","from":null,"to":"2026-03-19"},{"field":"periodEnd","from":null,"to":"2026-04-30"}]	2026-03-19 10:27:33.676037-04
88f7c482-07e4-4bc0-aa4e-6e710dea58b7	Traderverse	\N	System	\N	updated	initiative	26aac803-31b9-4513-ad15-bf20e5f43f27	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	[{"field":"leader","from":null,"to":"Aisha Patel"}]	2026-03-19 10:27:38.852125-04
4516b025-48a2-4f92-a979-3c49782214ec	Traderverse	\N	System	\N	updated	initiative	49ce317d-101c-4564-86d1-1f841df4f977	Omnilink Brokerage, Exchanges, Wallets, Apps Integratoin	[{"field":"periodStart","from":null,"to":"2026-03-01"},{"field":"periodEnd","from":null,"to":"2026-05-02"}]	2026-03-19 10:35:03.28685-04
4ea2f078-901c-46e6-8980-f26eb55f016c	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	story	683cd00b-3267-451a-b8fb-9f6d17c8800d	External Platform Authentication Layer	\N	2026-03-19 17:01:20.162869-04
c0d5809c-707e-45f9-b204-b4ac003fb7d2	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	story	5bb14c68-4b84-4440-85f2-780f26ff1334	Channel & Group Discovery + Mapping	\N	2026-03-19 17:02:01.190515-04
2fe0bc5a-5f02-4796-8c2c-a84a23f0a08b	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	story	62117f49-9b8b-4e70-a0b2-93e76936d62b	Message Ingestion Pipeline	\N	2026-03-19 17:02:29.845633-04
78a2339e-92e6-4678-816b-163654aac68e	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	\N	2026-03-19 17:19:19.486921-04
1e32d709-4c6c-4a82-afe6-e5f353be16b7	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	add message broker	\N	2026-03-19 17:19:54.466661-04
aea9b74f-e3e1-4d1b-8b11-ee0e30086dcb	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	e322967d-2a21-4030-b80e-b675750c2cd3	add cache layer using couche db	\N	2026-03-19 17:22:45.117183-04
39eb1db9-3396-4c61-883a-32dff68d7b57	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	zoom in	\N	2026-03-19 17:23:42.94892-04
b9460f8f-f5e7-4e86-9cb4-d5c4ac1b336c	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	434ece88-5500-4fad-a73c-b3e10d0b21cc	use some SSO technology	\N	2026-03-22 07:39:24.114511-04
32ae8a02-d529-4c3d-9594-fde9369abe39	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	5db27018-9f8d-42be-9ba1-790b3f76bf8c	implement keycloak	\N	2026-03-22 07:45:10.352968-04
3994c5bb-6dd0-415a-a6e7-45da6c19c68d	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	d2f71a4c-f717-4fbd-8179-492c1683b166	keycloak email templates	\N	2026-03-22 07:47:09.216267-04
46292e97-1bb2-48c0-8a3c-5b3af0074a06	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	1d5b6c18-2ba2-40e4-bc4f-5c0990af065d	keycloak centralizer dispatch system	\N	2026-03-22 07:47:41.022504-04
27f0ff98-1b5f-4470-9936-63d0cbfc2e18	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	c21ee4e4-3d9c-4c60-91ed-cb3f1b90d7bc	unique verified links	\N	2026-03-22 07:48:16.568689-04
6cf895e3-dc7e-42aa-8cfa-c23b8ec2ea02	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	story	5bb14c68-4b84-4440-85f2-780f26ff1334	Channel & Group Discovery + Mapping	[{"field":"owner","from":null,"to":"Sarim Alavi"}]	2026-03-22 07:48:47.999704-04
21ba72cb-a432-4450-b793-9e6f6c82fcfa	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	discord connection	\N	2026-03-22 07:49:24.284057-04
b958e78e-6ca0-440f-b909-48a5bccc2cb9	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	aadb98ee-3891-47da-976c-1c8bd07c9cea	telegram connection	\N	2026-03-22 07:49:41.654499-04
847d6ce0-fcde-4462-80b5-01314ac78ecb	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	3352eb1f-ce29-40c8-963c-23dba0f0f1a3	reddit connection	\N	2026-03-22 07:49:57.105854-04
ea346224-d59e-49ee-b28d-eebe3d390270	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	bd22b4fa-59ab-4cae-8280-768a3a0369c3	whatsapp	\N	2026-03-22 07:50:07.850129-04
d47dc7e2-74ab-40d2-a841-9108b6acc4c3	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	task	27fc8f20-6708-4442-bfff-00d655acc600	slack connection	\N	2026-03-22 07:50:31.640036-04
598841cb-83e8-47af-b85b-f4292c613531	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	created	story	ec7a6a93-250e-4073-bc89-03df76ef518c	fetch portoflio from external brokerage	\N	2026-03-22 07:59:08.218891-04
af23d58d-7d8b-4aef-a510-ec3d5cf4f4eb	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"comment","from":null,"to":"how are  doin this ?"}]	2026-03-22 08:10:26.672312-04
a9915712-31ad-4dd9-a74f-eaafcdd173a4	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"comment","from":null,"to":"by managing it"}]	2026-03-22 08:11:01.281126-04
57f460c0-50f9-4979-a639-e1ca79b8894f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	add message broker	[{"field":"comment","from":null,"to":"what about now ?"}]	2026-03-22 08:11:11.889323-04
d9e40efe-ef11-49f2-b6ef-8984e4f65d35	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"comment","from":null,"to":"good"}]	2026-03-22 08:11:40.867429-04
26f0db3a-9773-4a08-ada9-2c828dcc1b83	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"assigned","to":"in_progress"}]	2026-03-23 10:13:51.171479-04
7f1a9e4e-1dd5-4ea8-887f-999f28453911	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3851590a-199f-4d29-b718-c67760dd7bd1	Add rate limit headers to API responses	[{"field":"status","from":"assigned","to":"in_progress"}]	2026-03-23 10:13:55.059004-04
8d2e1998-5f4f-4596-8437-45b933c8a908	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"assigned","to":"in_progress"}]	2026-03-23 10:13:56.016-04
83aae824-8da3-4ce7-9f51-248b95f49f02	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"reviewerUserIds","from":null,"to":"1aa317fa-d752-445e-9fe5-20bf6397cae2"}]	2026-03-23 10:14:33.224521-04
27420d75-a7b3-4208-8d36-4b59aef1c0e7	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"in_progress","to":"in_review"}]	2026-03-23 10:16:38.935141-04
595f937a-95bc-4834-aab2-6002a2e37b6c	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"in_progress","to":"done"}]	2026-03-23 10:16:47.101858-04
6dbea995-e225-4e8c-87c9-2ed96e0ee41a	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3851590a-199f-4d29-b718-c67760dd7bd1	Add rate limit headers to API responses	[{"field":"status","from":"in_progress","to":"done"}]	2026-03-23 10:17:02.043159-04
d0b725e2-ee67-452e-b4ab-803af2e307d8	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"in_progress","to":"done"}]	2026-03-23 10:17:05.569778-04
f407e2e0-54b6-4618-874c-d9ace8a894a3	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"in_progress","to":"assigned"}]	2026-03-23 10:20:42.828277-04
7c2292bf-e867-4537-8620-29974bed7126	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"in_review","to":"assigned"}]	2026-03-23 10:20:43.937581-04
22e9c33f-e750-4a40-8a51-cf5fb69e03ef	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"in_progress","to":"in_review"}]	2026-03-23 10:20:48.147556-04
e2fbeed5-a624-46e5-bd6d-28ea7bcd84d1	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:20:57.330878-04
fbbb4b42-e3ea-4ab1-8c96-1df21c2aa487	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:20:58.301393-04
140fd8c1-b156-4ccf-b389-7dd400792b91	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	e322967d-2a21-4030-b80e-b675750c2cd3	add cache layer using couche db	[{"field":"status","from":"created","to":"in_review"}]	2026-03-23 10:22:40.7468-04
b525c701-056f-4096-b1cd-0c9ef4721d4b	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3851590a-199f-4d29-b718-c67760dd7bd1	Add rate limit headers to API responses	[{"field":"dueAt","from":null,"to":"2026-03-30T12:00:00.000Z"}]	2026-03-23 10:28:08.915053-04
7fadcc3d-c426-4054-833f-475fd301a7bb	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"dueAt","from":null,"to":"2026-03-24T12:00:00.000Z"}]	2026-03-23 10:28:10.822858-04
8fd834f1-010b-4da5-ba14-9c812285c749	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"dueAt","from":null,"to":"2026-03-29T12:00:00.000Z"}]	2026-03-23 10:28:13.615245-04
0f2995d4-1b6c-4b17-8c3e-05af4d8a6ef1	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:28:36.718284-04
b15afc43-f98a-4958-92b6-385df5a8ad7b	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	e322967d-2a21-4030-b80e-b675750c2cd3	add cache layer using couche db	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:28:38.334647-04
f0640884-77fa-4a43-a1ec-429399d680d9	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	add message broker	[{"field":"status","from":"created","to":"in_progress"}]	2026-03-23 10:28:48.868937-04
7d5b3a7f-ce57-4b86-b1be-9f114bc7e08d	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	bd22b4fa-59ab-4cae-8280-768a3a0369c3	whatsapp	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:29:08.282219-04
61756683-3687-4e2d-9489-6fa86d4fa216	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"done","to":"in_progress"}]	2026-03-23 10:20:45.230593-04
ed69948e-1bcc-4b15-90f8-c6f21da2b385	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3851590a-199f-4d29-b718-c67760dd7bd1	Add rate limit headers to API responses	[{"field":"status","from":"done","to":"in_review"}]	2026-03-23 10:20:47.070232-04
02f9cca8-61a3-441b-9e6e-2fada58e1a63	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"assigned","to":"in_review"}]	2026-03-23 10:20:53.635534-04
3aa2aee4-a5cb-4190-8710-387b03eb9125	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3851590a-199f-4d29-b718-c67760dd7bd1	Add rate limit headers to API responses	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:21:00.790891-04
00a9455a-a762-4b52-9bf1-7a203b5aa1a2	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:29:06.500148-04
5b5467a1-71b6-4d71-9e7d-ea7063339943	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"done","to":"in_progress"}]	2026-03-23 10:20:46.23421-04
bfbaab5a-e184-4166-97db-c23fdc3cdc97	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"in_progress","to":"in_review"}]	2026-03-23 10:20:51.507304-04
67f6986f-9bd9-4beb-aad7-40846e08b23f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:20:56.334904-04
cb5456d7-24cf-402e-ab7f-46eac4034ae3	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"done","to":"assigned"}]	2026-03-23 10:21:42.251862-04
d5f91bcc-1f44-41c8-aba9-32ec22f1decc	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"done","to":"in_progress"}]	2026-03-23 10:21:54.218166-04
103ba61d-1465-4b45-9f51-2703f7782b47	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"assigned","to":"in_review"}]	2026-03-23 10:22:19.79336-04
ddbbe82f-d699-4e9a-af79-a6bd98c9a8e4	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"dueAt","from":null,"to":"2026-03-26T12:00:00.000Z"}]	2026-03-23 10:28:05.796433-04
b6b82a8e-fc0d-4c3f-991c-28d652a568e1	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"dueAt","from":null,"to":"2026-03-24T12:00:00.000Z"}]	2026-03-23 10:28:09.988783-04
f97a229e-ef8f-4cac-b159-145b8bd52742	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	discord connection	[{"field":"dueAt","from":null,"to":"2026-03-25T12:00:00.000Z"}]	2026-03-23 10:28:11.612882-04
b82e6fa7-6ff8-4c94-af39-fd2c7a1f9aea	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	aadb98ee-3891-47da-976c-1c8bd07c9cea	telegram connection	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:28:39.583656-04
b28ed3b9-5b10-4832-85e7-ac0a3e0f064b	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	add message broker	[{"field":"status","from":"in_progress","to":"in_review"}]	2026-03-23 10:29:00.954073-04
2de62529-a592-43da-b8b7-a1a32b2e8d38	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"assigned","to":"in_progress"}]	2026-03-23 10:20:49.232399-04
e48f941c-f4f6-4302-9bca-b2059cc197c2	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"in_progress","to":"in_review"}]	2026-03-23 10:20:50.32332-04
a620fd40-793d-4cc4-b9d3-01b582235ff8	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:20:55.271656-04
f8a5f9cc-ccf7-494e-9704-98b77fdd5189	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"status","from":"created","to":"in_progress"}]	2026-03-23 10:22:37.960495-04
e5248de6-0538-4cf3-af6d-0e9ae8145652	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	aadb98ee-3891-47da-976c-1c8bd07c9cea	telegram connection	[{"field":"status","from":"created","to":"in_review"}]	2026-03-23 10:25:15.468534-04
aa186ed6-df0f-400d-8f48-ac47f87a62ec	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"dueAt","from":null,"to":"2026-03-28"}]	2026-03-23 10:25:31.349115-04
f878af30-2f9c-4678-b382-a6ad2772c4ab	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"in_progress","to":"done"}]	2026-03-23 10:28:40.597797-04
c43bd244-14b9-439c-b309-b61e0233b1f8	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"status","from":"in_progress","to":"done"}]	2026-03-23 10:28:45.733196-04
41fd43ad-ffa2-4763-81e7-b87ac65ab406	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	discord connection	[{"field":"status","from":"in_progress","to":"done"}]	2026-03-23 10:28:46.612562-04
a46e137b-bb7a-42b8-a38b-9cf3f727f1d7	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"assigned","to":"in_review"}]	2026-03-23 10:28:47.963672-04
26ecad1a-d6dc-444a-b74f-ffc131770a1f	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	zoom in	[{"field":"status","from":"created","to":"in_review"}]	2026-03-23 10:28:49.981163-04
c69d0ce3-7617-40d7-b5bc-22016cf6bad5	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	bd22b4fa-59ab-4cae-8280-768a3a0369c3	whatsapp	[{"field":"status","from":"created","to":"in_review"}]	2026-03-23 10:28:51.296993-04
1a399fea-2205-458e-8baa-3803a075b2df	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	zoom in	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:29:07.661405-04
a5eec908-2fe9-4f6c-b66d-0df3fed871ce	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"done","to":"assigned"}]	2026-03-23 10:22:13.753941-04
606162c8-fcb4-40a6-b233-95c2fa8bd554	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	discord connection	[{"field":"status","from":"created","to":"in_progress"}]	2026-03-23 10:25:13.803644-04
20737d3e-c552-4cc7-abc3-f6ee6a1bb834	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	add message broker	[{"field":"status","from":"in_review","to":"done"}]	2026-03-23 10:29:07.08351-04
bfac7efd-89a2-41f1-b444-4d7a61465e06	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	release	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	Patch: UI Polish	[{"field":"releaseNotes","from":"## Fixes\\n- Sidebar alignment on smaller screens\\n- Table sort indicator visibility\\n- Empty state illustrations\\n- Tooltip positioning fixes","to":"<h2>Release 1.0.2 — Patch: UI Polish</h2>\\n<p>This patch release includes bug fixes and minor improvements.</p>\\n<h3>What's Included</h3>\\n<h4>📦 #2 Performance</h4>\\n<p><em>No tasks in this delivery</em></p>\\n<hr>\\n<p><strong>Summary:</strong> 1 deliveries, 0 tasks (0 completed)</p>\\n"}]	2026-03-23 10:41:28.42984-04
9f2b24af-c7b7-4d74-8663-d2e6b211c165	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	release	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	Patch: UI Polish	[{"field":"releaseNotes","from":"<h2>Release 1.0.2 — Patch: UI Polish</h2>\\n<p>This patch release includes bug fixes and minor improvements.</p>\\n<h3>What's Included</h3>\\n<h4>📦 #2 Performance</h4>\\n<p><em>No tasks in this delivery</em></p>\\n<hr>\\n<p><strong>Summary:</strong> 1 deliveries, 0 tasks (0 completed)</p>\\n","to":"<h2>Release 1.0.2 — Patch: UI Polish</h2>\\n<p>This patch release includes bug fixes and minor improvements.</p>\\n<h3>What's Included</h3>\\n<h4>📦 #2 Performance</h4>\\n<p><strong>🔬 Research</strong></p>\\n<ul>\\n<li>Add rate limit headers to API responses ✅</li>\\n<li>Implement sliding window rate limiter ✅</li>\\n</ul>\\n<p><strong>📋 Other</strong></p>\\n<ul>\\n<li>add cache layer using couche db ✅</li>\\n<li>discord connection ✅</li>\\n<li>zoom in ✅</li>\\n<li>setup NATS with auth ✅</li>\\n<li>telegram connection ✅</li>\\n<li>add message broker ✅</li>\\n<li>whatsapp ✅</li>\\n</ul>\\n<p><strong>📄 Documentation</strong></p>\\n<ul>\\n<li>Profile database queries for N+1 ✅</li>\\n<li>Add Redis caching for dashboard widgets ✅</li>\\n</ul>\\n<p><strong>🎨 Design</strong></p>\\n<ul>\\n<li>Research GDPR data retention policies ✅</li>\\n</ul>\\n<hr>\\n<p><strong>Summary:</strong> 1 deliveries, 12 tasks (12 completed)</p>\\n"}]	2026-03-23 10:45:49.489734-04
a88ce408-6da5-43db-b97a-4a427bc20778	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	094553d1-30cd-467d-92a3-1d531fed63e5	Implement SSO with Google OAuth	[{"field":"ownerUserId","from":"aa2af4f7-c10c-40f0-858b-ea7c02ace2ad","to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:49:50.27289-04
ab600b2d-1d38-4b3e-8302-4afc47608183	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	094553d1-30cd-467d-92a3-1d531fed63e5	Implement SSO with Google OAuth	[{"field":"assigneeUserIds","from":null,"to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:49:54.703922-04
fee748c2-06bd-43e4-acb6-878906bec534	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	57f5bfa9-dd3a-4c07-82e5-06726e0c73d3	Fix mobile sidebar collapse animation	[{"field":"assigneeUserIds","from":null,"to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:50:04.916688-04
f2d721ec-3599-44ca-9b42-12c211373378	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	57f5bfa9-dd3a-4c07-82e5-06726e0c73d3	Fix mobile sidebar collapse animation	[{"field":"ownerUserId","from":"4ae5533b-61b6-4a92-b433-b4dca6350d6a","to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:50:09.565641-04
3b367389-7a1c-4c35-bf7c-a8ba16d0684e	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	d09d8307-d923-4959-93b5-8f723dc00d61	Evaluate Algolia vs Elasticsearch	[{"field":"status","from":"assigned","to":"done"}]	2026-03-23 15:50:28.717125-04
05673731-0255-47d3-a473-7ca343bf541b	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	4ad03c6a-3029-44ce-bdd8-176d689d6f19	Design dark mode color palette	[{"field":"status","from":"created","to":"done"}]	2026-03-23 15:50:29.700863-04
78dd163f-a876-46a7-a5bb-e8721f7427ff	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	4fe43852-a5f5-49f5-bde0-669f6edc74ff	Implement CSS variable theming system	[{"field":"status","from":"created","to":"done"}]	2026-03-23 15:50:30.92901-04
0000c9b4-b8b7-471b-b3de-01b17ba3b9ea	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	d09d8307-d923-4959-93b5-8f723dc00d61	Evaluate Algolia vs Elasticsearch	[{"field":"assigneeUserIds","from":null,"to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:50:35.958204-04
e3ee2293-17ff-4663-bc5f-0ca206a2a0d1	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	4ad03c6a-3029-44ce-bdd8-176d689d6f19	Design dark mode color palette	[{"field":"assigneeUserIds","from":null,"to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:50:40.854631-04
ca233350-cfbb-4bad-96ea-8a43a95f3da2	Traderboards	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	4fe43852-a5f5-49f5-bde0-669f6edc74ff	Implement CSS variable theming system	[{"field":"assigneeUserIds","from":null,"to":"e13268f9-37dd-4875-87f3-cdb9ea780a40"}]	2026-03-23 15:50:46.172651-04
f3805de6-4a5a-4d10-8eaf-0649fa638950	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	discord connection	[{"field":"dueAt","from":"Wed Mar 25 2026 08:00:00 GMT-0400 (Eastern Daylight Time)","to":"2026-03-28T12:00:00.000Z"}]	2026-03-23 15:57:10.632213-04
c2832920-be07-49b6-a93b-619fa833f2f7	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	discord connection	[{"field":"dueAt","from":"Sat Mar 28 2026 08:00:00 GMT-0400 (Eastern Daylight Time)","to":"2026-03-25T12:00:00.000Z"}]	2026-03-23 15:57:11.848962-04
90c9ce60-b479-46a6-9126-5e1e1247b689	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"estimateValue","from":null,"to":"12"}]	2026-03-24 07:12:58.629458-04
4521e24f-2c58-4911-a441-233b2205adf4	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"dueAt","from":null,"to":"2026-03-27"}]	2026-03-24 07:13:04.228202-04
529d7522-b120-4f8a-a9a8-ba5ee6a24e20	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	e293c039-129b-4e32-b794-d5fc485a570e	Fix cart quantity update race condition	[{"field":"dueAt","from":"Thu Mar 26 2026 20:00:00 GMT-0400 (Eastern Daylight Time)","to":"2026-03-31"}]	2026-03-24 07:16:47.481796-04
5fc56540-0b76-4288-9ac2-079cc353a4da	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	dfe77003-7b4a-4278-8d62-710f1c009a2e	Profile database queries for N+1	[{"field":"status","from":"done","to":"assigned"}]	2026-03-24 07:21:31.100397-04
3a4cc31e-5189-4efc-acce-68e2809c0046	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Add Redis caching for dashboard widgets	[{"field":"status","from":"done","to":"in_review"}]	2026-03-24 07:21:32.3736-04
3150c370-560e-44c2-9b92-0ff9d84ac1f6	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	292e7b3a-725b-4781-800b-488ff7ee8e0d	Implement sliding window rate limiter	[{"field":"status","from":"done","to":"in_progress"}]	2026-03-24 07:21:32.883829-04
821bea2a-dcaa-4374-bd8d-b4e49175e024	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8b920bf9-65df-4c67-ad05-3a622a846237	Research GDPR data retention policies	[{"field":"status","from":"done","to":"in_progress"}]	2026-03-24 07:21:34.050475-04
2d8e9075-f1d7-4051-99d9-bb537ef074a3	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	add message broker	[{"field":"status","from":"done","to":"in_review"}]	2026-03-24 07:21:36.463801-04
87de16f1-1731-495f-bbb8-aa8f8dc8a12c	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	release	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	Patch: UI Polish	[{"field":"releaseNotes","from":"<h2>Release 1.0.2 — Patch: UI Polish</h2>\\n<p>This patch release includes bug fixes and minor improvements.</p>\\n<h3>What's Included</h3>\\n<h4>📦 #2 Performance</h4>\\n<p><strong>🔬 Research</strong></p>\\n<ul>\\n<li>Add rate limit headers to API responses ✅</li>\\n<li>Implement sliding window rate limiter ✅</li>\\n</ul>\\n<p><strong>📋 Other</strong></p>\\n<ul>\\n<li>add cache layer using couche db ✅</li>\\n<li>discord connection ✅</li>\\n<li>zoom in ✅</li>\\n<li>setup NATS with auth ✅</li>\\n<li>telegram connection ✅</li>\\n<li>add message broker ✅</li>\\n<li>whatsapp ✅</li>\\n</ul>\\n<p><strong>📄 Documentation</strong></p>\\n<ul>\\n<li>Profile database queries for N+1 ✅</li>\\n<li>Add Redis caching for dashboard widgets ✅</li>\\n</ul>\\n<p><strong>🎨 Design</strong></p>\\n<ul>\\n<li>Research GDPR data retention policies ✅</li>\\n</ul>\\n<hr>\\n<p><strong>Summary:</strong> 1 deliveries, 12 tasks (12 completed)</p>\\n","to":"<h2>Release 1.0.2 — Patch: UI Polish</h2>\\n<p>This patch release includes bug fixes and minor improvements.</p>\\n<h3>What's Included</h3>\\n<h4>📦 #2 Performance</h4>\\n<p><strong>🔬 Research</strong></p>\\n<ul>\\n<li>Add rate limit headers to API responses ✅</li>\\n<li>Implement sliding window rate limiter</li>\\n</ul>\\n<p><strong>📋 Other</strong></p>\\n<ul>\\n<li>telegram connection ✅</li>\\n<li>discord connection ✅</li>\\n<li>setup NATS with auth</li>\\n<li>add message broker</li>\\n<li>zoom in ✅</li>\\n<li>add cache layer using couche db ✅</li>\\n<li>whatsapp ✅</li>\\n</ul>\\n<p><strong>📄 Documentation</strong></p>\\n<ul>\\n<li>Profile database queries for N+1</li>\\n<li>Add Redis caching for dashboard widgets</li>\\n</ul>\\n<p><strong>🎨 Design</strong></p>\\n<ul>\\n<li>Research GDPR data retention policies</li>\\n</ul>\\n<hr>\\n<p><strong>Summary:</strong> 1 deliveries, 12 tasks (6 completed)</p>\\n"}]	2026-03-24 07:28:51.533079-04
2e57b244-71fa-4f95-8ed4-9b0415232948	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	7408e609-5561-4165-9561-e48a9d09e7f0	setup NATS with auth	[{"field":"status","from":"done","to":"created"}]	2026-03-24 07:21:35.377368-04
2032188d-6af1-47d0-9454-53f6c86d01ff	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	e322967d-2a21-4030-b80e-b675750c2cd3	add cache layer using couche db	[{"field":"dueAt","from":null,"to":"2026-03-28T12:00:00.000Z"}]	2026-03-24 07:26:38.158505-04
8ce0ae93-293d-47d7-a9fd-86c58853cde1	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	aadb98ee-3891-47da-976c-1c8bd07c9cea	telegram connection	[{"field":"dueAt","from":null,"to":"2026-03-26T12:00:00.000Z"}]	2026-03-24 07:26:39.110434-04
c433bf10-e1e9-42ae-9a1b-6045ca74aacb	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	bd22b4fa-59ab-4cae-8280-768a3a0369c3	whatsapp	[{"field":"dueAt","from":null,"to":"2026-03-27T12:00:00.000Z"}]	2026-03-24 07:26:40.367915-04
b4e4a80f-4b79-4082-8f67-3cac319fb147	Traderverse	e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	updated	task	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	zoom in	[{"field":"dueAt","from":null,"to":"2026-03-25T12:00:00.000Z"}]	2026-03-24 07:26:41.515064-04
\.


--
-- Data for Name: asset_relations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.asset_relations (id, source_asset_id, target_asset_id, relation_type, created_at) FROM stdin;
\.


--
-- Data for Name: asset_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.asset_types (id, name, slug, category, icon, color, product_id, created_at) FROM stdin;
aac334f5-6b5e-44e9-9f89-3f369971e924	API	api	engineering	🔌	#4857FE	Traderverse	2026-03-23 17:40:36.947416-04
13ddaeed-192e-44a6-b59e-371c82492bd6	Service	service	engineering	⚙️	#7C5CFC	Traderverse	2026-03-23 17:40:36.950044-04
7200b5fe-cc0f-483c-807c-9ab9f469f6fb	Module	module	engineering	📦	#06b6d4	Traderverse	2026-03-23 17:40:36.951354-04
6f895ced-12b5-41ee-9c1a-593e5a026b91	Database	database	engineering	🗄️	#f59e0b	Traderverse	2026-03-23 17:40:36.952277-04
58c967d2-0401-4b6a-bd13-6268d65241f8	Table	table	engineering	📊	#eab308	Traderverse	2026-03-23 17:40:36.953323-04
fedc05ac-2f77-4f58-83ac-8a576abeba01	Server	server	engineering	🖥️	#64748b	Traderverse	2026-03-23 17:40:36.954324-04
981f6c37-8b32-41ef-ab5e-8d291b24f9bd	Environment	environment	engineering	🌍	#10b981	Traderverse	2026-03-23 17:40:36.955189-04
42e6ba8c-59d1-4d96-a255-46479527d205	Queue	queue	engineering	📬	#8b5cf6	Traderverse	2026-03-23 17:40:36.95637-04
6e983c48-30bd-428a-af7b-33fd78443d8d	Storage	storage	engineering	💾	#f97316	Traderverse	2026-03-23 17:40:36.957516-04
65238e7a-84e1-4b74-aade-36ccd57b8b37	Page	page	product	📄	#3b82f6	Traderverse	2026-03-23 17:40:36.958578-04
44cf6b20-1135-4c75-a54a-f1df7dd2d8d6	Feature	feature	product	✨	#8b5cf6	Traderverse	2026-03-23 17:40:36.959594-04
0939e9c1-3cd6-4a5a-a67e-1209143116fb	Flow	flow	product	🔀	#06b6d4	Traderverse	2026-03-23 17:40:36.960386-04
214e50be-df76-46ca-8e1f-0addf87f802c	Component	component	product	🧩	#ec4899	Traderverse	2026-03-23 17:40:36.961491-04
82a513d3-6d30-48b6-b4ec-a96b90fcc8f6	Article	article	business	📝	#6366f1	Traderverse	2026-03-23 17:40:36.96238-04
ae6f76eb-78f1-4bc9-8ea0-9532597921bc	SOP	sop	business	📋	#f59e0b	Traderverse	2026-03-23 17:40:36.963141-04
0ef3794a-0e61-4122-8581-f4ff74ebf26f	Policy	policy	business	📜	#ef4444	Traderverse	2026-03-23 17:40:36.964062-04
75d03342-47b8-41c2-8a2a-b58bdef03f97	Metric	metric	business	📈	#10b981	Traderverse	2026-03-23 17:40:36.964988-04
0a0d55a5-d331-4da1-8240-ee2541e22e7e	Experiment	experiment	business	🧪	#a855f7	Traderverse	2026-03-23 17:40:36.965806-04
647abb57-0f4e-44d0-a1d1-bb1bcb69e52b	Third-party API	third-party-api	external	🔗	#64748b	Traderverse	2026-03-23 17:40:36.966818-04
c470c72b-6f2b-49b2-9089-d8a35fcbc121	Vendor	vendor	external	🏢	#78716c	Traderverse	2026-03-23 17:40:36.967873-04
f56f079d-06a0-472d-a35e-0edd66ea66bb	Tool	tool	external	🛠️	#0ea5e9	Traderverse	2026-03-23 17:40:36.968784-04
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assets (id, product_id, asset_type_id, title, slug, description, content, status, visibility, owner_user_id, tags, parent_id, sort_order, created_by_user_id, created_at, updated_at) FROM stdin;
acfe524a-f87e-4ba8-93a3-466f3cf76b3c	Traderverse	aac334f5-6b5e-44e9-9f89-3f369971e924	REST API v1	rest-api-v1	Main REST API for Traderverse platform	## REST API v1\n\nThe primary API serving the Traderverse frontend and mobile applications.\n\n### Base URL\n\n`https://api.traderverse.io/v1`\n\n### Authentication\n\nAll endpoints require Bearer token authentication.\n\n### Rate Limits\n\n- 100 requests/minute for authenticated users\n- 10 requests/minute for public endpoints\n\n### Core Endpoints\n\n- `/auth` — Authentication and user management\n- `/portfolios` — Portfolio CRUD operations\n- `/trades` — Trade execution and history\n- `/market-data` — Real-time market data\n- `/analytics` — Performance analytics	active	internal	1aa317fa-d752-445e-9fe5-20bf6397cae2	{rest,backend,core}	\N	0	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-23 17:40:36.970274-04	2026-03-23 17:40:36.970274-04
30dac807-a523-492e-a4a0-85f6733a71ac	Traderverse	aac334f5-6b5e-44e9-9f89-3f369971e924	WebSocket API	websocket-api	Real-time data streaming API	## WebSocket API\n\nHandles real-time data streaming for live market prices, trade notifications, and portfolio updates.\n\n### Connection\n\n`wss://ws.traderverse.io`\n\n### Channels\n\n- `prices:{symbol}` — Live price updates\n- `trades:{userId}` — Trade execution notifications\n- `portfolio:{userId}` — Portfolio value changes\n\n### Message Format\n\nAll messages use JSON with `type` and `data` fields.	active	internal	191d69c7-3274-4f10-b27f-d74635020d75	{websocket,realtime,streaming}	\N	0	191d69c7-3274-4f10-b27f-d74635020d75	2026-03-23 17:40:36.973943-04	2026-03-23 17:40:36.973943-04
0b8d01cc-daaa-4aa4-bea3-63127dc85bea	Traderverse	13ddaeed-192e-44a6-b59e-371c82492bd6	Auth Service	auth-service	Authentication and authorization microservice	## Auth Service\n\nManages user authentication, JWT token issuance, and role-based access control.\n\n### Technology\n\n- Elysia on Bun runtime\n- PostgreSQL for user storage\n- bcrypt for password hashing\n- JWT RS256 for tokens\n\n### Responsibilities\n\n- User registration and login\n- Token refresh and revocation\n- Password reset flow\n- Role management (admin, trader, viewer)\n- OAuth2 integration (Google, GitHub)	active	internal	1aa317fa-d752-445e-9fe5-20bf6397cae2	{auth,security,jwt}	\N	0	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-23 17:40:36.975579-04	2026-03-23 17:40:36.975579-04
eee16fd5-49a0-42eb-bffc-669cb12344b5	Traderverse	13ddaeed-192e-44a6-b59e-371c82492bd6	Market Data Service	market-data-service	Aggregates and distributes market data from exchanges	## Market Data Service\n\nAggregates real-time and historical market data from multiple exchange APIs.\n\n### Data Sources\n\n- Binance API\n- Coinbase Pro\n- Kraken\n- Yahoo Finance\n\n### Features\n\n- Price normalization across exchanges\n- OHLCV candle aggregation\n- Order book depth snapshots\n- Historical data backfill	active	internal	191d69c7-3274-4f10-b27f-d74635020d75	{market-data,exchanges,aggregation}	\N	0	191d69c7-3274-4f10-b27f-d74635020d75	2026-03-23 17:40:36.976968-04	2026-03-23 17:40:36.976968-04
57255552-cbe3-4805-9238-34ea4aabc121	Traderverse	6f895ced-12b5-41ee-9c1a-593e5a026b91	Primary PostgreSQL	primary-postgresql	Main application database	## Primary PostgreSQL\n\nThe main relational database for all application data.\n\n### Connection\n\n- Host: `db.internal.traderverse.io`\n- Port: 5432\n- Database: `traderverse_prod`\n\n### Key Tables\n\n- users, portfolios, trades, positions\n- market_data, candles, order_books\n- notifications, activity_log\n\n### Backup Schedule\n\n- Full backup: Daily at 2 AM UTC\n- WAL archiving: Continuous\n- Retention: 30 days	active	internal	56d4291a-715d-425f-a201-8a029e67ab37	{postgresql,database,production}	\N	0	56d4291a-715d-425f-a201-8a029e67ab37	2026-03-23 17:40:36.978245-04	2026-03-23 17:40:36.978245-04
7d99fa56-5a37-4af5-8444-4aa99fafd864	Traderverse	42e6ba8c-59d1-4d96-a255-46479527d205	NATS Message Broker	nats-message-broker	Event streaming and message queue infrastructure	## NATS Message Broker\n\nDistributed messaging system for event-driven architecture.\n\n### Subjects\n\n- `trades.executed` — Trade execution events\n- `prices.updated` — Price change notifications\n- `portfolio.rebalance` — Rebalance triggers\n- `notifications.send` — User notification dispatch\n\n### Configuration\n\n- Cluster: 3-node JetStream\n- Retention: 7 days\n- Max message size: 1MB	active	internal	1aa317fa-d752-445e-9fe5-20bf6397cae2	{nats,messaging,events}	\N	0	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-23 17:40:36.979509-04	2026-03-23 17:40:36.979509-04
783b4dd0-0884-45b4-824c-6cf817668929	Traderverse	65238e7a-84e1-4b74-aade-36ccd57b8b37	Dashboard	dashboard	Main user dashboard with portfolio overview	## Dashboard Page\n\nThe primary landing page after login showing portfolio summary and market overview.\n\n### Components\n\n- Portfolio value card with sparkline\n- Asset allocation donut chart\n- Recent trades table\n- Watchlist with live prices\n- News feed sidebar\n\n### Data Sources\n\n- Portfolio API for holdings\n- Market Data API for live prices\n- Analytics API for performance charts	active	internal	191d69c7-3274-4f10-b27f-d74635020d75	{ui,dashboard,portfolio}	\N	0	191d69c7-3274-4f10-b27f-d74635020d75	2026-03-23 17:40:36.980637-04	2026-03-23 17:40:36.980637-04
dda04959-4bad-401d-a83b-fa6782fc8c38	Traderverse	44cf6b20-1135-4c75-a54a-f1df7dd2d8d6	Copy Trading	copy-trading	Follow and automatically copy trades from top performers	## Copy Trading Feature\n\nAllows users to follow successful traders and automatically mirror their trades.\n\n### User Flow\n\n1. Browse leaderboard of top traders\n2. View trader profile with performance history\n3. Click "Follow" and set allocation amount\n4. Trades are automatically copied in proportion\n5. Real-time P&L tracking per followed trader\n\n### Business Rules\n\n- Minimum follow amount: $100\n- Maximum 10 followed traders\n- 1% platform fee on copy trade profits\n- Instant unfollow with position close option	draft	internal	1aa317fa-d752-445e-9fe5-20bf6397cae2	{copy-trading,social,feature}	\N	0	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-23 17:40:36.981574-04	2026-03-23 17:40:36.981574-04
4c243761-6b5f-435f-9002-2fc163ba01d9	Traderverse	ae6f76eb-78f1-4bc9-8ea0-9532597921bc	Incident Response	incident-response	Standard operating procedure for production incidents	## Incident Response SOP\n\n### Severity Levels\n\n- **P1 Critical**: Service down, data loss risk — respond in 5 min\n- **P2 High**: Major feature broken — respond in 15 min\n- **P3 Medium**: Degraded performance — respond in 1 hour\n- **P4 Low**: Minor issue — respond next business day\n\n### Response Steps\n\n1. Acknowledge the alert\n2. Assess severity and impact\n3. Communicate in #incidents Slack channel\n4. Investigate root cause\n5. Apply fix or rollback\n6. Verify resolution\n7. Write post-mortem (P1/P2 only)\n\n### Escalation\n\n- P1: Notify on-call → Engineering Lead → CTO\n- P2: Notify on-call → Engineering Lead	active	internal	56d4291a-715d-425f-a201-8a029e67ab37	{incident,operations,procedure}	\N	0	56d4291a-715d-425f-a201-8a029e67ab37	2026-03-23 17:40:36.982369-04	2026-03-23 17:40:36.982369-04
74504491-6335-4b49-b685-a2dbfa4f51f8	Traderverse	647abb57-0f4e-44d0-a1d1-bb1bcb69e52b	Stripe Payments	stripe-payments	Payment processing integration	## Stripe Integration\n\nHandles all payment processing for subscriptions and one-time charges.\n\n### API Version\n\n`2024-11-20.acacia`\n\n### Features Used\n\n- Checkout Sessions for subscription signup\n- Customer Portal for self-service billing\n- Webhooks for payment events\n- Payment Intents for one-time charges\n\n### Webhook Events\n\n- `checkout.session.completed`\n- `invoice.paid`\n- `customer.subscription.updated`\n- `customer.subscription.deleted`\n\n### Environment\n\n- Test: `sk_test_...`\n- Live: `sk_live_...` (in Vault)	active	internal	1aa317fa-d752-445e-9fe5-20bf6397cae2	{stripe,payments,billing}	\N	0	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-23 17:40:36.983295-04	2026-03-23 17:40:36.983295-04
92e0e3a7-a438-4dad-ba7a-fb7d555d0684	Traderverse	f56f079d-06a0-472d-a35e-0edd66ea66bb	Slack	slack	Team communication and alerting	## Slack Integration\n\n### Channels\n\n- `#general` — Team-wide announcements\n- `#engineering` — Technical discussions\n- `#incidents` — Production incident coordination\n- `#deployments` — Automated deployment notifications\n- `#alerts` — Monitoring alerts from Datadog\n\n### Bots\n\n- **DeployBot** — Posts deployment status\n- **AlertBot** — Forwards critical alerts\n- **StandupBot** — Daily standup reminders	active	internal	191d69c7-3274-4f10-b27f-d74635020d75	{slack,communication,alerts}	\N	0	191d69c7-3274-4f10-b27f-d74635020d75	2026-03-23 17:40:36.984655-04	2026-03-23 17:40:36.984655-04
7abd8d69-db49-44ca-8e38-7d222d1b7c85	Traderverse	82a513d3-6d30-48b6-b4ec-a96b90fcc8f6	Getting Started Guide	getting-started-guide	Onboarding guide for new team members	## Getting Started Guide\n\nWelcome to Traderverse! This guide will help you get set up.\n\n### Day 1\n\n1. Set up your development environment (see Local Setup Guide)\n2. Get access to GitHub, Slack, and Figma\n3. Meet your buddy/mentor\n4. Read the Architecture Overview\n\n### Week 1\n\n1. Complete a "hello world" PR\n2. Attend sprint planning\n3. Shadow a code review\n4. Read through core API documentation\n\n### Month 1\n\n1. Own and deliver your first task\n2. Present at team demo\n3. Contribute to wiki documentation	active	internal	56d4291a-715d-425f-a201-8a029e67ab37	{onboarding,guide,new-hire}	\N	0	56d4291a-715d-425f-a201-8a029e67ab37	2026-03-23 17:40:36.985735-04	2026-03-23 17:40:36.985735-04
\.


--
-- Data for Name: backlog_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.backlog_items (id, title, description, type, priority, status, product, initiative, delivery, owner, estimate, acceptance_criteria, created_at, updated_at, owner_avatar) FROM stdin;
25d0e68c-2e7e-45d1-b5a8-e55f8fc57ae8	Add dark mode support	Users have requested dark mode	feature	medium	backlog	Product	\N	\N	\N	\N	\N	2026-03-06 16:18:09.413676-05	2026-03-06 16:18:09.413676-05	\N
247bf31c-c932-4c06-acde-baca0fcb6814	Export to CSV	Allow users to export data	feature	low	backlog	Product	\N	\N	\N	\N	\N	2026-03-06 16:18:09.417383-05	2026-03-06 16:18:09.417383-05	\N
7999566f-179e-4fa8-aa02-df55c59008a4	Webhook integrations	Support third-party webhook callbacks	feature	medium	in_progress	Product	\N	\N	\N	\N	\N	2026-03-06 16:18:09.419253-05	2026-03-06 16:18:09.419253-05	\N
8d00a385-6e79-4c99-baf8-2564757e1819	Multi-language support	i18n framework integration	research	low	backlog	Product	\N	\N	\N	\N	\N	2026-03-06 16:18:09.420628-05	2026-03-06 16:18:09.420628-05	\N
e10fe94a-677d-41a6-ac52-4564c300250b	Add product-level roadmap view	\N	feature	medium	backlog	Product	\N	\N	\N	\N	\N	2026-03-06 16:43:31.13766-05	2026-03-06 16:43:31.13766-05	\N
c67234f6-7f9e-4fc0-8f2b-6e321c7344b1	User authentication flow redesign	Redesign the login and registration flow for better UX	feature	high	in_progress	default	\N	2026-03-15	Liam	\N	\N	2026-03-07 13:12:19.9651-05	2026-03-07 13:12:19.9651-05	\N
1b5cba6c-cf9a-40a7-bb95-918dcdf0e8a1	Improve dashboard load performance	Dashboard takes 4+ seconds to load with large datasets	improvement	high	in_progress	default	\N	2026-03-20	Guy	\N	\N	2026-03-07 13:12:19.982526-05	2026-03-07 13:12:19.982526-05	\N
314053c3-16eb-4ba6-860a-b2f71f22ebd0	Research AI-powered search integration	Evaluate options for semantic search using vector embeddings	research	medium	backlog	default	\N	\N	\N	\N	\N	2026-03-07 13:12:19.989335-05	2026-03-07 13:12:19.989335-05	\N
c34e0908-b6db-4c4b-93e5-5237307b9ae3	Add dark mode support	Implement system-wide dark mode toggle with theme persistence	feature	medium	backlog	default	\N	2026-04-01	Liam	\N	\N	2026-03-07 13:12:19.991913-05	2026-03-07 13:12:19.991913-05	\N
d791cf20-3c5a-4a48-9525-dc1dd56f3761	Customer feedback widget	Allow users to submit feedback directly from the app	request	low	backlog	default	\N	\N	Esther	\N	\N	2026-03-07 13:12:19.99399-05	2026-03-07 13:12:19.99399-05	\N
3c407a04-dded-4d0d-bdaf-92426a740b8f	Mobile responsive navigation	Navigation menu doesnt collapse properly on mobile devices	feature	medium	in_progress	default	\N	2026-03-25	Liam	\N	\N	2026-03-07 13:12:20.002089-05	2026-03-07 13:12:20.002089-05	\N
119db7a4-41c3-4ec0-a6d8-cc5622ef824f	Research GDPR compliance requirements	Document all data handling practices and identify gaps	research	low	backlog	default	\N	\N	\N	\N	\N	2026-03-07 13:12:20.005062-05	2026-03-07 13:12:20.005062-05	\N
3527df15-ef34-4f73-b75d-56af4b3374ac	User authentication flow redesign	Redesign the login and registration flow for better UX	feature	high	in_progress	Traderboards	\N	2026-03-15	Liam	\N	\N	2026-03-07 13:14:37.570205-05	2026-03-07 13:14:37.570205-05	\N
d739da6d-3a5b-4f29-b362-b05f51c5d57d	Improve dashboard load performance	Dashboard takes 4+ seconds to load with large datasets	improvement	high	in_progress	Traderboards	\N	2026-03-20	Guy	\N	\N	2026-03-07 13:14:37.584374-05	2026-03-07 13:14:37.584374-05	\N
fbb7a9cf-0add-4038-bb78-1741040bac47	Customer feedback widget	Allow users to submit feedback directly from the app	request	low	backlog	Traderboards	\N	\N	Esther	\N	\N	2026-03-07 13:14:37.596519-05	2026-03-07 13:14:37.596519-05	\N
1be3253a-d297-453e-aa3a-407cdbe08e98	Mobile responsive navigation	Navigation menu doesnt collapse properly on mobile devices	feature	medium	in_progress	Traderboards	\N	2026-03-25	Liam	\N	\N	2026-03-07 13:14:37.605422-05	2026-03-07 13:14:37.605422-05	\N
f95ece4a-361e-467e-a609-036643d66ce8	Research GDPR compliance requirements	Document all data handling practices and identify gaps	research	low	backlog	Traderboards	\N	\N	\N	\N	\N	2026-03-07 13:14:37.607873-05	2026-03-07 13:14:37.607873-05	\N
ac6513a0-330f-4609-9e62-deb45cd78b8d	need to test snaptrade execution with etrade	load balance intro auth and setup api portfolio pooler	feature	medium	backlog	Traderverse	Add events module to traderverse inlcuding tournament	2026-03-27	Daniel Kim	\N	\N	2026-03-07 12:47:50.720085-05	2026-03-09 13:19:54.963-04	https://mockmind-api.uifaces.co/content/human/6.jpg
5c881f5c-a7bc-4159-83de-bda97870542c	Fix cart total calculation bug	Cart total shows wrong amount when discount codes are applied	bug	critical	initialized	default	\N	\N	Esther	\N	\N	2026-03-07 13:12:19.976665-05	2026-03-07 13:12:19.976665-05	\N
d687e33c-5d6d-474b-9a0b-3f9143d31ac4	Mobile responsive navigation	Navigation menu doesnt collapse properly on mobile devices	feature	medium	in_progress	Traderverse	Add events module to traderverse inlcuding tournament	#4 setup one	Emily Chen	12	\N	2026-03-07 13:16:31.999812-05	2026-03-15 11:57:20.498-04	https://mockmind-api.uifaces.co/content/human/3.jpg
9b3ec16e-9835-4cd6-81fd-421569be8701	Research AI-powered search integration	Evaluate options for semantic search using vector embeddings	research	medium	completed	Traderboards	\N	\N	\N	\N	\N	2026-03-07 13:14:37.587532-05	2026-03-23 15:50:28.721-04	\N
74c865d8-3c5a-46df-8550-694e69bac2a7	Customer feedback widget	Allow users to submit feedback directly from the app	request	low	backlog	Traderverse	Add events module to traderverse inlcuding tournament	#4 setup one	Michael Torres	\N	\N	2026-03-07 13:16:31.992604-05	2026-03-15 11:57:24.391-04	https://mockmind-api.uifaces.co/content/human/4.jpg
d0d69cdc-17c6-4f4b-9977-c828519664a9	Research AI-powered search integration	Evaluate options for semantic search using vector embeddings	research	medium	backlog	Traderverse	Add events module to traderverse inlcuding tournament	#4 setup one	Sarim Alavi	\N	\N	2026-03-07 13:16:31.987696-05	2026-03-18 06:57:39.252-04	/uploads/avatars/05e3d00c-93b1-421a-af78-74e4f5b1a2f7-1772890707309.jpg
e049ece4-9633-484d-895f-c3ca0b2a14de	Add dark mode support	Implement system-wide dark mode toggle with theme persistence	feature	medium	backlog	Traderverse	brokerage and exchange integrations	#4 setup one	Sarim Alavi	\N	\N	2026-03-07 13:16:31.990366-05	2026-03-15 11:57:25.462-04	/uploads/avatars/05e3d00c-93b1-421a-af78-74e4f5b1a2f7-1772890707309.jpg
60aa978e-835c-422f-84b2-c50bdb3605d5	Improve dashboard load performance	Dashboard takes 4+ seconds to load with large datasets	improvement	high	in_progress	Traderverse	brokerage and exchange integrations	#4 setup one	Sarim Alavi	\N	\N	2026-03-07 13:16:31.980392-05	2026-03-24 07:21:32.379-04	/uploads/avatars/05e3d00c-93b1-421a-af78-74e4f5b1a2f7-1772890707309.jpg
e363e0ae-a96b-4bba-ace2-8c059bdf0d86	Fix notification email formatting	HTML emails render incorrectly on Outlook	bug	high	completed	default	\N	\N	Guy	\N	\N	2026-03-07 13:12:19.996567-05	2026-03-07 13:12:19.996567-05	\N
8aa75e70-64eb-45ba-a764-cb2023c9b19c	User authentication flow redesign	Redesign the login and registration flow for better UX	feature	high	in_progress	Traderverse	brokerage and exchange integrations	#4 setup one	Daniel Kim	\N	\N	2026-03-07 13:16:31.964148-05	2026-03-15 11:57:29.638-04	https://mockmind-api.uifaces.co/content/human/6.jpg
06cc44c0-b1aa-488e-a8ad-357abfcda67f	Fix notification email formatting	HTML emails render incorrectly on Outlook	bug	high	completed	Traderboards	\N	\N	Guy	\N	\N	2026-03-07 13:14:37.599804-05	2026-03-07 13:14:37.599804-05	\N
80af1e7b-b3a9-4997-814c-4c1f91a0f9df	API rate limiting implementation	Add rate limiting middleware to prevent abuse	improvement	critical	initialized	default	\N	2026-03-10	\N	\N	\N	2026-03-07 13:12:19.999831-05	2026-03-07 13:12:19.999831-05	\N
48a7e6ae-c3bb-41c6-9493-321ea0024da0	Fix cart total calculation bug	Cart total shows wrong amount when discount codes are applied	bug	critical	initialized	Traderboards	\N	\N	Esther	\N	\N	2026-03-07 13:14:37.580857-05	2026-03-07 13:14:37.580857-05	\N
a00d7080-09bf-4df6-87ed-9a56909787f0	Add dark mode support	Implement system-wide dark mode toggle with theme persistence	feature	medium	completed	Traderboards	\N	2026-04-01	Liam	\N	\N	2026-03-07 13:14:37.590375-05	2026-03-23 15:50:30.932-04	\N
ec7a6a93-250e-4073-bc89-03df76ef518c	fetch portoflio from external brokerage	need to create balance and transaction of external brokrages	feature	medium	backlog	Traderverse	Omnilink Brokerage, Exchanges, Wallets, Apps Integratoin	2026-04-04	Sarim Alavi	\N	connects to all snaptrade accout correctly and fetch portoflio details	2026-03-22 07:59:08.213217-04	2026-03-24 07:12:03.812-04	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg
683cd00b-3267-451a-b8fb-9f6d17c8800d	External Platform Authentication Layer	Goal: Enable secure connection to external platforms\nDescription:\nImplement OAuth/API-based authentication for Discord, Telegram, Slack, WhatsApp, X, LinkedIn, and Facebook.\n\nAcceptance Criteria:\nUser/admin can connect platform accounts\nTokens securely stored and refreshable\nSupports multiple accounts per user/org	feature	medium	drafted	Traderverse	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	\N	Rachel Green	27	\N	2026-03-19 17:01:20.157003-04	2026-03-22 07:48:16.573-04	https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face
07190179-695b-49b7-819d-c8cdbf303d6a	Fix cart total calculation bug	Cart total shows wrong amount when discount codes are applied	bug	critical	in_progress	Traderverse	Add events module to traderverse inlcuding tournament	#1 Bug Fixes	Lisa Wang	12	\N	2026-03-07 13:16:31.97512-05	2026-03-24 07:12:58.636-04	https://mockmind-api.uifaces.co/content/human/7.jpg
34d9c9d8-42b4-4076-a54c-52909ff304e7	Snap trade integration	build snaptrade integration	feature	medium	backlog	Traderverse	allow brokerage and exchange integrations	\N	David Kim	12	\N	2026-03-18 06:55:56.347773-04	2026-03-18 06:56:33.475-04	https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face
8c51e6d6-ed3a-4e23-bb7b-95ceaea3691d	Fix notification email formatting	HTML emails render incorrectly on Outlook	bug	high	completed	Traderverse	brokerage and exchange integrations	#4 setup one	Michael Torres	\N	\N	2026-03-07 13:16:31.994653-05	2026-03-15 11:57:21.941-04	https://mockmind-api.uifaces.co/content/human/4.jpg
ca1d7fa2-3e65-4cd3-a8c3-8dbea2a14cae	API rate limiting implementation	Add rate limiting middleware to prevent abuse	improvement	critical	initialized	Traderboards	\N	2026-03-10	\N	\N	\N	2026-03-07 13:14:37.602832-05	2026-03-07 13:14:37.602832-05	\N
852356c6-1387-4b54-8072-e2034795b4a1	API rate limiting implementation	Add rate limiting middleware to prevent abuse	improvement	critical	in_progress	Traderverse	Add events module to traderverse inlcuding tournament	#4 setup one	Emily Chen	\N	\N	2026-03-07 13:16:31.997518-05	2026-03-24 07:21:32.888-04	https://mockmind-api.uifaces.co/content/human/3.jpg
5bb14c68-4b84-4440-85f2-780f26ff1334	Channel & Group Discovery + Mapping	Goal: Import and map external communities\nDescription:\nFetch available servers, channels, groups, and pages and allow users to map them into Traderverse Guilds.\nAcceptance Criteria:\n\nList of channels/groups fetched\n\nUser selects and maps to Guild\n\nSupports multiple mappings	feature	medium	drafted	Traderverse	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	#2 Performance	Sarim Alavi	18	\N	2026-03-19 17:02:01.183383-04	2026-03-23 10:29:08.286-04	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg
34d36cc8-0181-4f8a-9f81-f1e5d4802fb2	Research GDPR compliance requirements	Document all data handling practices and identify gaps	feature	low	in_progress	Traderverse	brokerage and exchange integrations	#2 Performance	James Cooper	\N	\N	2026-03-07 13:16:32.002132-05	2026-03-24 07:21:34.054-04	https://mockmind-api.uifaces.co/content/human/2.jpg
62117f49-9b8b-4e70-a0b2-93e76936d62b	Message Ingestion Pipeline	Goal: Bring external conversations into Traderverse\nDescription:\nBuild ingestion service to pull messages from connected platforms in near real-time.\nAcceptance Criteria:\n\nMessages ingested with metadata (user, timestamp, source)\n\nSupports streaming + batch ingestion\n\nHandles rate limits + retries	feature	medium	in_progress	Traderverse	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	#2 Performance	David Kim	28	\N	2026-03-19 17:02:29.840635-04	2026-03-24 07:21:36.468-04	https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face
\.


--
-- Data for Name: deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deliveries (id, product_id, title, description, start_date, end_date, status, created_by_user_id, created_at, updated_at) FROM stdin;
4703a4d1-c962-4f91-8f8e-58f9176cdad2	Traderverse	#1 Bug Fixes	Fix critical bugs in cart and notification systems	2026-03-01	2026-03-15	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.052014-04	2026-03-15 14:15:25.052014-04
6affc085-4599-4c6c-afcb-16dbd13b6b7c	Traderboards	#1 Auth & Navigation	Auth redesign and mobile navigation improvements	2026-03-01	2026-03-15	in_progress	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.063066-04	2026-03-15 14:15:25.063066-04
2ec044fa-adf9-480d-98a2-c1deb67d433d	Traderboards	#2 Search & Dark Mode	AI search integration and dark mode support	2026-03-16	2026-03-31	completed	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.065686-04	2026-03-23 15:50:30.93-04
0c02b2d0-990c-4768-a743-bef847263125	Traderverse	#2 Performance	Dashboard performance and API rate limiting	2026-03-16	2026-03-31	active	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.060961-04	2026-03-24 07:21:32.376-04
\.


--
-- Data for Name: delivery_initiatives; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delivery_initiatives (id, delivery_id, initiative_id) FROM stdin;
30feb781-fa5c-4342-995a-b51fcf2258a4	4703a4d1-c962-4f91-8f8e-58f9176cdad2	aaa35b31-365c-4c5f-9579-da12a3088b66
cc90af58-5a2a-48a4-9811-08914bcd204b	0c02b2d0-990c-4768-a743-bef847263125	aaa35b31-365c-4c5f-9579-da12a3088b66
6781793f-805a-4afe-a41b-5e1d1e42844e	6affc085-4599-4c6c-afcb-16dbd13b6b7c	0af9452a-ec47-41ff-be8d-72b306ef848d
7269d3ac-eb46-4ebc-b088-e5c5b241608e	2ec044fa-adf9-480d-98a2-c1deb67d433d	0af9452a-ec47-41ff-be8d-72b306ef848d
\.


--
-- Data for Name: deployment_targets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deployment_targets (id, release_deployment_id, server_id, status, deployed_at, failed_at, logs_url) FROM stdin;
0c0f1c4e-6827-4911-aca3-f07db63b5221	777744ce-29dd-42c3-984b-cbb722850a76	1875bfdd-f5dd-40ea-a049-b4bef212971e	deployed	2026-02-20 00:00:00	\N	\N
559627cb-6d3e-4d44-be01-4c1ae7d981ef	777744ce-29dd-42c3-984b-cbb722850a76	e06d8ee6-bd96-4ada-9069-657fe3095375	deployed	2026-02-20 00:00:00	\N	\N
4ca51aa1-0900-4391-9bb5-2e4ed11f92c3	4e794449-ebd2-459f-80ce-445f2c0090a4	fe516b84-fae8-4e91-8150-44ecf956f158	deployed	2026-02-22 00:00:00	\N	\N
c3cf3689-07d3-4691-8e08-603fbf35a9eb	4e794449-ebd2-459f-80ce-445f2c0090a4	f704fe25-cafb-4828-be53-ccc7dc329766	deployed	2026-02-22 00:00:00	\N	\N
bca4cfcc-c5a5-4a86-a831-2df16f6d12ca	fce3588a-8b62-4122-90ca-ef3d5705be3b	90242272-51b9-4965-bbdc-beeb96fa87da	deployed	2026-02-25 00:00:00	\N	\N
a79af51c-a749-4bbc-a538-2acda5a8cbe2	fce3588a-8b62-4122-90ca-ef3d5705be3b	de355e0a-2c3e-45e4-bfe4-7f911a9489ad	deployed	2026-02-25 00:00:00	\N	\N
9568743f-fffa-4990-a5d9-9ad6aec8566e	fce3588a-8b62-4122-90ca-ef3d5705be3b	4c3837f7-b1af-427f-8e2b-b6a6003cfe43	deployed	2026-02-25 00:00:00	\N	\N
7e1f16f0-84ae-4cc4-a8eb-0bb898be35d2	a4e0a977-de71-489e-9255-53d6f4888386	1875bfdd-f5dd-40ea-a049-b4bef212971e	deployed	2026-03-14 00:00:00	\N	\N
7e11f87d-f8d4-4269-a4fc-d76547125c71	a4e0a977-de71-489e-9255-53d6f4888386	e06d8ee6-bd96-4ada-9069-657fe3095375	deployed	2026-03-14 00:00:00	\N	\N
3d7433ff-8336-463a-a7f1-d51d5ba7ab2d	cdebc7d5-cd1e-4085-b6f2-c3bb3a29e497	fe516b84-fae8-4e91-8150-44ecf956f158	deployed	2026-03-16 00:00:00	\N	\N
cc37e13e-a567-4a4f-8ec6-c71f0a8ae883	cdebc7d5-cd1e-4085-b6f2-c3bb3a29e497	f704fe25-cafb-4828-be53-ccc7dc329766	deploying	\N	\N	\N
21006e49-efd5-4c62-b28d-2357d028937e	5b74bd9b-aada-4d81-9a25-c295092082da	1875bfdd-f5dd-40ea-a049-b4bef212971e	deployed	2026-03-10 00:00:00	\N	\N
6682adc2-6b2b-4392-ad4b-2ea12cae64de	5b74bd9b-aada-4d81-9a25-c295092082da	e06d8ee6-bd96-4ada-9069-657fe3095375	deployed	2026-03-10 00:00:00	\N	\N
ca76c98d-4f65-4d63-ba0a-06f096b9a447	fc2b6795-db6c-4cb7-bd9a-e4b34d3a7be3	fe516b84-fae8-4e91-8150-44ecf956f158	failed	\N	2026-03-11 00:00:00	https://logs.productier.io/deploy/r3-stage-001
1979a019-cecc-4acc-92d1-a6ace877d765	fc2b6795-db6c-4cb7-bd9a-e4b34d3a7be3	f704fe25-cafb-4828-be53-ccc7dc329766	pending	\N	\N	\N
\.


--
-- Data for Name: favorites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.favorites (id, user_id, entity_type, entity_id, product_id, created_at) FROM stdin;
934d219a-e86d-4e17-937e-c7dfe0036bde	e13268f9-37dd-4875-87f3-cdb9ea780a40	initiative	26aac803-31b9-4513-ad15-bf20e5f43f27	Traderverse	2026-03-23 09:13:33.688273-04
1f32b7cf-9d61-4b1d-a31b-0242ea551826	e13268f9-37dd-4875-87f3-cdb9ea780a40	initiative	49ce317d-101c-4564-86d1-1f841df4f977	Traderverse	2026-03-23 09:13:34.268508-04
cd79d453-f6c2-40ff-b4a5-4329000be8fc	e13268f9-37dd-4875-87f3-cdb9ea780a40	initiative	47dfa091-f1c3-4393-9706-f42d24622532	Traderverse	2026-03-23 09:13:37.153951-04
e62d3371-df51-454f-82ec-fb5edf0ad5b1	e13268f9-37dd-4875-87f3-cdb9ea780a40	initiative	aaa35b31-365c-4c5f-9579-da12a3088b66	Traderverse	2026-03-23 09:13:38.000227-04
f1e172b7-1bc8-4d60-a148-1d7a39624a95	e13268f9-37dd-4875-87f3-cdb9ea780a40	story	ec7a6a93-250e-4073-bc89-03df76ef518c	Traderverse	2026-03-23 09:45:02.1728-04
f7cbaf6e-41f4-4991-9b75-cad59e04f00f	e13268f9-37dd-4875-87f3-cdb9ea780a40	story	62117f49-9b8b-4e70-a0b2-93e76936d62b	Traderverse	2026-03-23 09:45:02.600095-04
ca64b76b-6704-498f-866f-309c7ea18742	e13268f9-37dd-4875-87f3-cdb9ea780a40	story	5bb14c68-4b84-4440-85f2-780f26ff1334	Traderverse	2026-03-23 09:45:03.033333-04
\.


--
-- Data for Name: initiatives; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.initiatives (id, title, description, status, period, leader, priority, created_at, updated_at, period_start, period_end, product, leader_avatar) FROM stdin;
47dfa091-f1c3-4393-9706-f42d24622532	User Experience Overhaul	Redesign key user flows including auth, navigation and dark mode	planning	\N	Olivia Taylor	medium	2026-03-15 14:15:25.046831-04	2026-03-15 14:15:25.046831-04	2026-04-01	2026-06-30	Traderverse	https://images.unsplash.com/photo-1685760259914-ee8d2c92d2e0?w=200&h=200&fit=crop&crop=face
0af9452a-ec47-41ff-be8d-72b306ef848d	Traderboards V2 Launch	Major release with new features and performance improvements	active	\N	Elena Petrova	critical	2026-03-15 14:15:25.049456-04	2026-03-15 14:15:25.049456-04	2026-02-01	2026-04-30	Traderboards	https://images.unsplash.com/photo-1629425733761-caae3b5f2e50?w=200&h=200&fit=crop&crop=face
49ce317d-101c-4564-86d1-1f841df4f977	Omnilink Brokerage, Exchanges, Wallets, Apps Integratoin	<h2><strong>Omnilink — Traderverse Integration Layer</strong></h2><p>Omnilink is Traderverse’s universal integration framework that connects financial platforms, applications, and communities into a single, interoperable ecosystem. It enables any brokerage, exchange, fintech app, or developer platform to seamlessly integrate with Traderverse—while also allowing Traderverse to embed and extend into external systems.</p><p>At its core, Omnilink removes fragmentation across the trading experience by unifying identity, data, and interaction layers across platforms.</p><hr><h3><strong>What Omnilink Enables</strong></h3><p>Omnilink allows partners to embed Traderverse components—such as social feeds, analytics, profiles, and community modules—directly into their own applications across web, mobile (iOS/Android), and desktop environments. At the same time, external tools, dashboards, and services can be embedded inside Traderverse, creating a fully bi-directional integration model.</p><p>It supports transaction-level connectivity by enabling users to initiate buy/sell actions through a unified interface, which are then routed to connected brokerages or exchanges. This ensures a seamless flow from discovery and discussion to execution, without forcing users to leave the ecosystem.</p><p>Omnilink also integrates with brokerages, exchanges, and crypto wallets to provide access to holdings, transaction history, and portfolio data. This creates a standardized data layer across traditionally siloed platforms.</p><hr><h3><strong>Identity &amp; User Continuity</strong></h3><p>A key component of Omnilink is its identity layer. Users can move across platforms with one-click single sign-on (SSO), whether entering Traderverse from a partner app or accessing external platforms from Traderverse. Their profile, preferences, subscriptions, and settings persist across all integrated environments, creating a continuous and personalized experience.</p><hr><h3><strong>Content &amp; Network Effects</strong></h3><p>Omnilink enables seamless content sharing both into and out of Traderverse. Insights, strategies, and discussions can be distributed across external platforms, while external content can be brought into the Traderverse ecosystem—amplifying reach, engagement, and network effects.</p><hr><h3><strong>Security &amp; Access Control</strong></h3><p>The framework supports secure integrations through public, private, and certificate-based access layers. This ensures that partners maintain full control over permissions, data access, and user interactions while operating within a shared ecosystem.</p><hr><h2><strong>Why It Matters</strong></h2><p>Today’s trading experience is fragmented—users research in one place, discuss in another, and execute elsewhere. Omnilink brings all of these layers together.</p><p>For partners, it means:</p><ul><li><p>Increased user engagement and retention</p></li><li><p>Access to a verified social and behavioral layer</p></li><li><p>New monetization opportunities through embedded modules and communities</p></li></ul><p>For users, it means:</p><ul><li><p>A unified identity across platforms</p></li><li><p>Seamless movement between discovery, learning, and execution</p></li><li><p>A more connected and intelligent trading experience</p></li></ul><hr><h2><strong>Positioning</strong></h2><p>Omnilink transforms Traderverse into the foundational infrastructure for the modern financial ecosystem—serving as the <strong>identity, data, and interaction layer</strong> across brokerages, exchanges, and financial applications.</p>	planning	\N	Sarim Alavi	medium	2026-03-18 06:54:08.71212-04	2026-03-19 10:35:17.302-04	2026-03-01	2026-05-02	Traderverse	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg
aaa35b31-365c-4c5f-9579-da12a3088b66	Q1 Platform Stability	Focus on fixing critical bugs and improving performance across the platform	active	\N	Sarim Alavi	high	2026-03-15 14:15:25.040544-04	2026-03-19 10:35:23.945-04	2026-01-01	2026-03-31	Traderverse	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg
26aac803-31b9-4513-ad15-bf20e5f43f27	Tradenion - Discord, Telegram, Slack, Whatsapp, X, LinkedIn, Facebook Integration	<h2><strong>Tradenion — Unified Community Integration Layer</strong></h2><p>Tradenion enables seamless integration with major communication and social platforms—including Discord, Telegram, Slack, WhatsApp, X (Twitter), LinkedIn, and Facebook—bringing fragmented trading communities into a single, structured ecosystem.</p><hr><h3><strong>What Tradenion Does</strong></h3><p>Tradenion connects external communities directly into Traderverse, allowing conversations, insights, signals, and user activity from platforms like Discord and Telegram to be ingested, organized, and enriched within a unified interface. This transforms scattered discussions into structured, searchable, and actionable intelligence.</p><hr><h3><strong>Core Capabilities</strong></h3><p><strong>1. Cross-Platform Community Aggregation</strong></p><ul><li><p>Integrates groups, channels, and conversations from:</p><ul><li><p>Discord, Telegram, Slack</p></li><li><p>WhatsApp communities</p></li><li><p>X (Twitter), LinkedIn, Facebook</p></li></ul></li><li><p>Centralizes all communication into one unified feed</p></li></ul><hr><p><strong>2. Structured Data Layer</strong></p><ul><li><p>Converts unstructured messages into:</p><ul><li><p>Trade ideas</p></li><li><p>Signals</p></li><li><p>Insights</p></li></ul></li><li><p>Tags content by:</p><ul><li><p>Asset (stocks, crypto, etc.)</p></li><li><p>Sentiment</p></li><li><p>User credibility</p></li></ul></li></ul><hr><p><strong>3. Identity &amp; Attribution</strong></p><ul><li><p>Maps external usernames to Traderverse profiles</p></li><li><p>Builds credibility scores based on cross-platform activity</p></li><li><p>Tracks influence and engagement across networks</p></li></ul><hr><p><strong>4. Real-Time Sync &amp; Engagement</strong></p><ul><li><p>Bi-directional flow:</p><ul><li><p>Pull external conversations into Traderverse</p></li><li><p>Push insights back to external platforms</p></li></ul></li><li><p>Enables users to interact without leaving their preferred platform</p></li></ul><hr><p><strong>5. Shareability &amp; Distribution</strong></p><ul><li><p>Publish Traderverse content directly to:</p><ul><li><p>Discord channels</p></li><li><p>Telegram groups</p></li><li><p>X threads, LinkedIn posts, Facebook groups</p></li></ul></li><li><p>Amplifies reach and virality</p></li></ul><hr><p><strong>6. Moderation &amp; Intelligence Layer</strong></p><ul><li><p>AI-powered filtering of:</p><ul><li><p>Spam</p></li><li><p>Low-quality signals</p></li><li><p>Scam activity</p></li></ul></li><li><p>Highlights high-value contributors and trending discussions</p></li></ul><hr><h2><strong>Why It Matters</strong></h2><p>Today, most trading activity happens outside of brokerages—across fragmented communities on Discord, Telegram, and social media. These platforms lack structure, credibility, and integration with actual trading workflows.</p><p>Tradenion bridges this gap by:</p><ul><li><p>Bringing community-driven insights into a structured environment</p></li><li><p>Enabling platforms to capture and monetize external engagement</p></li><li><p>Creating a unified social graph across all major communication channels</p></li></ul><hr><h2><strong>Positioning</strong></h2><p>Tradenion transforms Traderverse into the <strong>central intelligence and communication layer</strong> for global trading communities—connecting where traders already are and turning scattered conversations into actionable market insight.</p>	planning	\N	Aisha Patel	medium	2026-03-19 10:25:52.750148-04	2026-03-19 10:27:38.848-04	2026-03-19	2026-04-30	Traderverse	https://images.unsplash.com/photo-1655249481446-25d575f1c054?w=200&h=200&fit=crop&crop=face
\.


--
-- Data for Name: product_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_members (id, product, user_id, role, added_at) FROM stdin;
ce76015f-e3aa-4989-a0d4-95792ea9565f	Traderverse	1aa317fa-d752-445e-9fe5-20bf6397cae2	member	2026-03-19 07:28:07.260913
ad5e53e3-c500-4b2c-850c-05335348b802	Traderverse	fb3c9346-7f43-4699-82d2-3530e23053ca	member	2026-03-19 07:28:08.781955
3b5e0e94-c9b5-46d6-8794-928354db1926	Traderverse	17734b85-b69f-4072-ad5b-e2119322972e	member	2026-03-19 07:28:10.353001
1d22707b-e9cc-433e-b033-9a9352443614	Traderverse	27e172b3-3a14-4ef4-b0b8-f26db20a6569	member	2026-03-19 07:28:13.240498
e1cedba2-61d7-4cb4-92c1-a5d644f5893a	Traderverse	cee0cfc3-e0cf-42a3-8525-ced3c2c8b6ab	member	2026-03-19 07:28:15.964735
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.products (id, name, logo, description, created_by_user_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: release_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.release_deliveries (id, release_id, delivery_id, deployment_order, added_at, added_by_user_id) FROM stdin;
db8b976c-7094-4eb0-ad5d-5edb2a66c99a	8e9dba6e-a57a-4806-bcf6-9d2e33a14570	6affc085-4599-4c6c-afcb-16dbd13b6b7c	1	2026-03-16 15:21:54.291779-04	1aa317fa-d752-445e-9fe5-20bf6397cae2
68e916fd-f180-4405-8833-6a46311a2cf3	2fe59c74-31be-43e4-b593-50f6514f440d	4703a4d1-c962-4f91-8f8e-58f9176cdad2	1	2026-03-16 15:21:54.301494-04	1aa317fa-d752-445e-9fe5-20bf6397cae2
040ee686-88f6-4f66-b0b0-cab860b964bc	2fe59c74-31be-43e4-b593-50f6514f440d	2ec044fa-adf9-480d-98a2-c1deb67d433d	2	2026-03-16 15:21:54.30248-04	1aa317fa-d752-445e-9fe5-20bf6397cae2
9378dce9-3247-4df2-9b43-3c66ccfe4fce	fc2e03b7-2115-43c2-9631-2f8edcfba2cd	0c02b2d0-990c-4768-a743-bef847263125	1	2026-03-16 15:21:54.309428-04	56d4291a-715d-425f-a201-8a029e67ab37
baf1f1bd-2a32-41ab-83f6-4277661430d8	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	0c02b2d0-990c-4768-a743-bef847263125	1	2026-03-23 10:29:31.389304-04	e13268f9-37dd-4875-87f3-cdb9ea780a40
\.


--
-- Data for Name: release_deployments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.release_deployments (id, release_id, environment, sequence, status, started_at, completed_at, failed_at, deployed_by_user_id, notes) FROM stdin;
777744ce-29dd-42c3-984b-cbb722850a76	8e9dba6e-a57a-4806-bcf6-9d2e33a14570	dev	1	deployed	2026-02-20 00:00:00	2026-02-20 00:00:00	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	Clean deployment to dev
4e794449-ebd2-459f-80ce-445f2c0090a4	8e9dba6e-a57a-4806-bcf6-9d2e33a14570	stage	2	deployed	2026-02-22 00:00:00	2026-02-22 00:00:00	\N	191d69c7-3274-4f10-b27f-d74635020d75	QA verified on staging
fce3588a-8b62-4122-90ca-ef3d5705be3b	8e9dba6e-a57a-4806-bcf6-9d2e33a14570	prod	3	deployed	2026-02-25 00:00:00	2026-02-25 00:00:00	\N	191d69c7-3274-4f10-b27f-d74635020d75	Production rollout complete
a4e0a977-de71-489e-9255-53d6f4888386	2fe59c74-31be-43e4-b593-50f6514f440d	dev	1	deployed	2026-03-14 00:00:00	2026-03-14 00:00:00	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	Dev deployment verified
cdebc7d5-cd1e-4085-b6f2-c3bb3a29e497	2fe59c74-31be-43e4-b593-50f6514f440d	stage	2	deploying	2026-03-16 00:00:00	\N	\N	191d69c7-3274-4f10-b27f-d74635020d75	Rolling out to staging servers
841e7d79-17d5-4489-8845-85700830cce0	2fe59c74-31be-43e4-b593-50f6514f440d	prod	3	pending	\N	\N	\N	\N	\N
5b74bd9b-aada-4d81-9a25-c295092082da	fc2e03b7-2115-43c2-9631-2f8edcfba2cd	dev	1	deployed	2026-03-10 00:00:00	2026-03-10 00:00:00	\N	56d4291a-715d-425f-a201-8a029e67ab37	\N
fc2b6795-db6c-4cb7-bd9a-e4b34d3a7be3	fc2e03b7-2115-43c2-9631-2f8edcfba2cd	stage	2	failed	2026-03-11 00:00:00	\N	2026-03-11 00:00:00	56d4291a-715d-425f-a201-8a029e67ab37	Migration script failed on stage DB
03a44c88-e52a-4c03-bc8c-230acfba2a2c	fc2e03b7-2115-43c2-9631-2f8edcfba2cd	prod	3	pending	\N	\N	\N	\N	\N
2aaa61e2-d440-4c43-88b6-205d4c989606	b531ef1c-ce04-49c4-a9a6-eed85984f9ca	dev	1	pending	\N	\N	\N	\N	\N
1721a285-52c6-4849-89ee-6bcbfb06e393	b531ef1c-ce04-49c4-a9a6-eed85984f9ca	stage	2	pending	\N	\N	\N	\N	\N
9837188a-bd5f-4467-b3f5-fd66cef9cf74	b531ef1c-ce04-49c4-a9a6-eed85984f9ca	prod	3	pending	\N	\N	\N	\N	\N
e6e70985-2ad8-449f-9f59-dc902c8ac52d	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	dev	1	pending	\N	\N	\N	\N	\N
fb5a6a31-b6fe-45f9-b035-95a123b7bdd0	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	stage	2	pending	\N	\N	\N	\N	\N
4b32e9ca-2189-4f6e-adaa-22afe7d7c788	e5db5fbc-5442-4437-a7bc-0d57ebabe6da	prod	3	pending	\N	\N	\N	\N	\N
\.


--
-- Data for Name: releases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.releases (id, code, version, title, status, release_type, planned_at, started_at, completed_at, created_by_user_id, release_manager_id, notes, release_notes, product_id, created_at, updated_at) FROM stdin;
8e9dba6e-a57a-4806-bcf6-9d2e33a14570	R-1	1.0.0	Initial Launch	completed	feature	2026-02-15 00:00:00	2026-02-20 00:00:00	2026-02-25 00:00:00	1aa317fa-d752-445e-9fe5-20bf6397cae2	191d69c7-3274-4f10-b27f-d74635020d75	First production release with core authentication and navigation features.	## What's New\n- User authentication (login, signup, password reset)\n- Main navigation and sidebar\n- Product switching\n- Team management basics	Traderverse	2026-03-16 15:21:54.289609-04	2026-03-16 15:21:54.289609-04
2fe59c74-31be-43e4-b593-50f6514f440d	R-2	1.1.0	Search & Performance	in_progress	feature	2026-03-20 00:00:00	2026-03-14 00:00:00	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	1aa317fa-d752-445e-9fe5-20bf6397cae2	AI-powered search and performance improvements bundled together.	## What's New\n- AI-powered search across all entities\n- Dark mode support\n- Performance optimizations\n- Caching layer improvements	Traderverse	2026-03-16 15:21:54.300284-04	2026-03-16 15:21:54.300284-04
fc2e03b7-2115-43c2-9631-2f8edcfba2cd	R-3	1.1.1	Hotfix: Login Timeout	failed	hotfix	2026-03-10 00:00:00	2026-03-10 00:00:00	\N	56d4291a-715d-425f-a201-8a029e67ab37	191d69c7-3274-4f10-b27f-d74635020d75	Emergency fix for login timeout issues reported by multiple users.	## Fixes\n- Fixed session timeout causing repeated login prompts\n- Increased token refresh window	Traderverse	2026-03-16 15:21:54.308163-04	2026-03-16 15:21:54.308163-04
b531ef1c-ce04-49c4-a9a6-eed85984f9ca	R-4	1.2.0	Analytics & Reporting	draft	feature	2026-04-01 00:00:00	\N	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	1aa317fa-d752-445e-9fe5-20bf6397cae2	Upcoming analytics dashboard and reporting features.	## Planned\n- Product analytics dashboard\n- Sprint velocity reports\n- Burndown charts\n- CSV/PDF export for reports	Traderverse	2026-03-16 15:21:54.315102-04	2026-03-16 15:21:54.315102-04
e5db5fbc-5442-4437-a7bc-0d57ebabe6da	R-5	1.0.2	Patch: UI Polish	planned	patch	2026-03-25 00:00:00	\N	\N	191d69c7-3274-4f10-b27f-d74635020d75	191d69c7-3274-4f10-b27f-d74635020d75	Minor UI fixes and polish across all views.	<h2>Release 1.0.2 — Patch: UI Polish</h2>\n<p>This patch release includes bug fixes and minor improvements.</p>\n<h3>What's Included</h3>\n<h4>📦 #2 Performance</h4>\n<p><strong>🔬 Research</strong></p>\n<ul>\n<li>Add rate limit headers to API responses ✅</li>\n<li>Implement sliding window rate limiter</li>\n</ul>\n<p><strong>📋 Other</strong></p>\n<ul>\n<li>telegram connection ✅</li>\n<li>discord connection ✅</li>\n<li>setup NATS with auth</li>\n<li>add message broker</li>\n<li>zoom in ✅</li>\n<li>add cache layer using couche db ✅</li>\n<li>whatsapp ✅</li>\n</ul>\n<p><strong>📄 Documentation</strong></p>\n<ul>\n<li>Profile database queries for N+1</li>\n<li>Add Redis caching for dashboard widgets</li>\n</ul>\n<p><strong>🎨 Design</strong></p>\n<ul>\n<li>Research GDPR data retention policies</li>\n</ul>\n<hr>\n<p><strong>Summary:</strong> 1 deliveries, 12 tasks (6 completed)</p>\n	Traderverse	2026-03-16 15:21:54.318067-04	2026-03-24 07:28:51.528-04
\.


--
-- Data for Name: servers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.servers (id, name, environment, host, port, protocol, region, provider, instance_id, is_active, product_id, created_at, updated_at) FROM stdin;
1875bfdd-f5dd-40ea-a049-b4bef212971e	dev-app-01	dev	dev-app-01.internal.productier.io	8080	https	us-east-1	AWS	i-0a1b2c3d4e5f60001	1	Traderverse	2026-03-16 15:21:54.278954-04	2026-03-16 15:21:54.278954-04
e06d8ee6-bd96-4ada-9069-657fe3095375	dev-app-02	dev	dev-app-02.internal.productier.io	8080	https	us-east-1	AWS	i-0a1b2c3d4e5f60002	1	Traderverse	2026-03-16 15:21:54.282338-04	2026-03-16 15:21:54.282338-04
fe516b84-fae8-4e91-8150-44ecf956f158	stage-app-01	stage	stage-app-01.internal.productier.io	443	https	us-east-1	AWS	i-0a1b2c3d4e5f70001	1	Traderverse	2026-03-16 15:21:54.283788-04	2026-03-16 15:21:54.283788-04
f704fe25-cafb-4828-be53-ccc7dc329766	stage-app-02	stage	stage-app-02.internal.productier.io	443	https	us-east-1	AWS	i-0a1b2c3d4e5f70002	1	Traderverse	2026-03-16 15:21:54.28505-04	2026-03-16 15:21:54.28505-04
90242272-51b9-4965-bbdc-beeb96fa87da	prod-app-01	prod	prod-app-01.internal.productier.io	443	https	us-east-1	AWS	i-0a1b2c3d4e5f80001	1	Traderverse	2026-03-16 15:21:54.286187-04	2026-03-16 15:21:54.286187-04
de355e0a-2c3e-45e4-bfe4-7f911a9489ad	prod-app-02	prod	prod-app-02.internal.productier.io	443	https	us-east-1	AWS	i-0a1b2c3d4e5f80002	1	Traderverse	2026-03-16 15:21:54.28699-04	2026-03-16 15:21:54.28699-04
4c3837f7-b1af-427f-8e2b-b6a6003cfe43	prod-app-03	prod	prod-app-03.internal.productier.io	443	https	us-west-2	AWS	i-0a1b2c3d4e5f80003	1	Traderverse	2026-03-16 15:21:54.287725-04	2026-03-16 15:21:54.287725-04
\.


--
-- Data for Name: story_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.story_comments (id, story_id, user_id, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: task_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_attachments (id, task_id, user_id, file_name, file_size, mime_type, file_path, created_at) FROM stdin;
\.


--
-- Data for Name: task_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_comments (id, task_id, user_id, content, created_at, updated_at) FROM stdin;
92f1d4ed-4c2d-4b1d-80ae-445ca65db9b3	e293c039-129b-4e32-b794-d5fc485a570e	e13268f9-37dd-4875-87f3-cdb9ea780a40	why is. this no working	2026-03-16 13:48:05.758074-04	2026-03-16 13:48:05.758074-04
3b5046e7-f6be-417c-9f7e-f2597f4754ad	56bfb6d1-2505-4280-89ab-40149c3d103b	e13268f9-37dd-4875-87f3-cdb9ea780a40	i this done ?	2026-03-18 06:56:57.659083-04	2026-03-18 06:56:57.659083-04
b632c36c-5e76-4519-bc9c-6c7101c86f5e	7408e609-5561-4165-9561-e48a9d09e7f0	e13268f9-37dd-4875-87f3-cdb9ea780a40	how are  doin this ?	2026-03-22 08:10:26.669554-04	2026-03-22 08:10:26.669554-04
eecfc34a-992f-4dba-8b8b-63ffd5a948d7	7408e609-5561-4165-9561-e48a9d09e7f0	e13268f9-37dd-4875-87f3-cdb9ea780a40	by managing it	2026-03-22 08:11:01.276859-04	2026-03-22 08:11:01.276859-04
cd54fc5f-10bf-4725-9bf7-7ad1d71235ba	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	e13268f9-37dd-4875-87f3-cdb9ea780a40	what about now ?	2026-03-22 08:11:11.886187-04	2026-03-22 08:11:11.886187-04
70ee00c6-716f-4649-b35e-bda9fb8de0e7	7408e609-5561-4165-9561-e48a9d09e7f0	e13268f9-37dd-4875-87f3-cdb9ea780a40	good	2026-03-22 08:11:40.86465-04	2026-03-22 08:11:40.86465-04
\.


--
-- Data for Name: task_status_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_status_history (id, task_id, product_id, from_status, to_status, changed_by_user_id, changed_at) FROM stdin;
56dafed7-911e-4131-a1a3-7bddb5e5e615	e293c039-129b-4e32-b794-d5fc485a570e	Traderverse	\N	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.074-04
c6b9914e-b65c-4763-b5e6-5cec0d4cdddb	6db740fc-6cee-4a2f-a006-20e2227f6d52	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.08-04
ec5549de-c7d5-46f6-8545-fd22191c0d05	a1cec26e-ce9d-406a-865d-066d659c0739	Traderverse	\N	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.082-04
4ad5ae31-2b3f-4338-95ef-aebb26d59b91	4d70223f-2b91-44be-8168-a650e96dcf42	Traderverse	\N	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.084-04
1fc82c70-b3a5-4ed6-be0b-164b6c7a0626	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	\N	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.087-04
9134ff34-2518-481a-abd1-e6e6981c1cd4	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.089-04
955a7b3a-727a-45f0-bb1d-4d2f0373246f	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	\N	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.09-04
d0936d90-4290-41ea-820b-1149f45eabaa	3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.092-04
5a6b568f-4fbd-4a4a-be79-5d87a9994c20	772b419d-4ad0-4bd0-896f-759abab890e7	Traderverse	\N	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.093-04
2f005062-2f80-4c31-a364-8bef82abed78	bbc36c7d-6c05-40ab-a26f-d77640f986d2	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.096-04
8aef1a94-a6d8-4fab-93b3-e818a1fde156	e8adf32b-f441-4ae1-af26-9c4bcf3ea0c3	Traderverse	\N	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.097-04
b2865e3c-fcc8-4c98-b047-ae0f458269ea	ee620d60-ed8e-4f2c-baa3-8c78ebc6878e	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.1-04
fa1949ff-3edf-41dd-a51e-94e0c70b14dc	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	\N	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.101-04
e430e0d8-b166-4b37-9976-cb0ec81cc12a	07e14e97-c7d8-4325-8fd0-8017e0ea6de3	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-15 14:15:25.103-04
e983e9f6-d4d0-467c-b222-cf2cc36c2857	094553d1-30cd-467d-92a3-1d531fed63e5	Traderboards	\N	in_progress	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.108-04
0cb3f3cc-bc00-4a59-aa8d-acfde638172d	8f3b0c65-c7e5-4aae-9c9c-8d098a1dfbf0	Traderboards	\N	done	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.111-04
fa27ef4b-9e71-4a3d-8a13-c0051f971c45	57f5bfa9-dd3a-4c07-82e5-06726e0c73d3	Traderboards	\N	in_progress	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.113-04
bb887cb2-7bd0-40b7-993a-c78a5f26f506	1e211914-6025-4f09-b52d-058653c31c39	Traderboards	\N	created	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.117-04
6b6f4b46-813f-4b07-a4f4-4ffe6d475d19	631c4444-ee99-4bae-9afc-cc4c963f9302	Traderboards	\N	in_review	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.119-04
107ee197-ad18-4826-9db9-f50ac8bf245a	d09d8307-d923-4959-93b5-8f723dc00d61	Traderboards	\N	assigned	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.12-04
6958e5b3-d793-4de8-ae72-0c7b0011f287	4ad03c6a-3029-44ce-bdd8-176d689d6f19	Traderboards	\N	created	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.121-04
8eb0a4c8-da29-4f8a-92ee-2a6245c942b0	4fe43852-a5f5-49f5-bde0-669f6edc74ff	Traderboards	\N	created	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.122-04
e4b1008b-2beb-4765-bc56-b376e643a427	6bbf4466-da53-422e-9fcd-a7f68310c5fe	Traderboards	\N	in_progress	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.124-04
ea16ad35-37d9-4150-8741-587d5f7c93d5	6167812a-f972-404d-ad46-d5207acdcb99	Traderboards	\N	assigned	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-15 14:15:25.125-04
8006f0c1-17b0-432c-8bfd-4dd2d691d572	ee620d60-ed8e-4f2c-baa3-8c78ebc6878e	Traderverse	created	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 12:06:27.801584-04
e2e677b4-2689-454a-b463-59ee2e0f8cc9	3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	created	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 12:08:44.371648-04
c09ce7eb-6624-4c54-836d-d048b1ba4fdc	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	created	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 12:08:56.088945-04
4c07d1ab-8729-4ca4-be31-8edb588b2a3d	6db740fc-6cee-4a2f-a006-20e2227f6d52	Traderverse	created	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 12:18:30.452594-04
fe1b4602-0843-41d7-8694-125920177720	bbc36c7d-6c05-40ab-a26f-d77640f986d2	Traderverse	created	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 12:18:37.216626-04
64ea8b1d-fd78-4f5e-8b57-685a660bb349	07e14e97-c7d8-4325-8fd0-8017e0ea6de3	Traderverse	created	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 12:18:41.058542-04
68f0853b-602d-45c6-b419-7ae5d1fd7fda	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	assigned	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-16 13:39:48.557295-04
6b9a5989-e964-4667-afbc-5983dead08ba	56bfb6d1-2505-4280-89ab-40149c3d103b	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-18 06:56:33.466937-04
8e13ab2c-6fdb-40ff-bd0b-c0a7e0c26886	7408e609-5561-4165-9561-e48a9d09e7f0	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-19 17:19:19.486931-04
88f71e40-5500-48f3-8332-f9832242c76f	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-19 17:19:54.466807-04
01a58d72-f60e-4285-928a-7d977fbd0f75	e322967d-2a21-4030-b80e-b675750c2cd3	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-19 17:22:45.117183-04
d7ddb776-9b5c-4a85-b678-5822c2ba99b5	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-19 17:23:42.948962-04
4fcd95b3-0387-4bdb-bcdf-e8363822eb75	434ece88-5500-4fad-a73c-b3e10d0b21cc	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:39:24.114649-04
f53ea83f-41cc-4e58-a8bd-6d8a25aabbd4	5db27018-9f8d-42be-9ba1-790b3f76bf8c	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:45:10.353007-04
6ec629a2-1193-46c2-9f6e-09ca4b16c04b	d2f71a4c-f717-4fbd-8179-492c1683b166	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:47:09.216339-04
751d3ca0-f6f5-413a-9d22-fbfecff23507	1d5b6c18-2ba2-40e4-bc4f-5c0990af065d	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:47:41.022426-04
30f0c5ec-9e43-46ca-8cd5-b89ec1726cb3	c21ee4e4-3d9c-4c60-91ed-cb3f1b90d7bc	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:48:16.569012-04
720f5538-85b4-42c2-ab2e-6b7949fcad0d	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:49:24.284092-04
dabcc49e-230f-4f40-a371-9f85e38c67d7	aadb98ee-3891-47da-976c-1c8bd07c9cea	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:49:41.654498-04
515b2960-4606-4eba-925d-e1210b85e9f4	3352eb1f-ce29-40c8-963c-23dba0f0f1a3	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:49:57.105918-04
7588a764-b94e-4fb6-934d-95595ebfa091	bd22b4fa-59ab-4cae-8280-768a3a0369c3	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:50:07.850129-04
4b44ff4e-2307-498d-bcbb-6c86a0d0461a	27fc8f20-6708-4442-bfff-00d655acc600	Traderverse	\N	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-22 07:50:31.640187-04
18bb3a84-a83b-4dd5-9a25-e81466ca14a9	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	assigned	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:13:51.16885-04
ba39d191-6f8a-4e1a-ad76-a242a25f2032	3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	assigned	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:13:55.055829-04
b05d6f8f-ac6d-40ff-9bcd-0c39c4687836	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	assigned	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:13:56.012518-04
334fe5e8-01b6-4bdf-97da-5922598a63fc	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	in_progress	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:16:38.932666-04
0bb3014b-d175-4717-8c0e-90bb02d334f6	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	in_progress	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:16:47.098589-04
92b200e2-6793-4e4f-8d02-1230b16ef326	3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	in_progress	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:17:02.039728-04
f099b491-7d00-48db-851b-2416864c3668	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	in_progress	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:17:05.56702-04
05e336df-61c7-4199-8bf7-6babf568c41b	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	in_progress	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:42.825649-04
1d9c09a8-0e31-4394-ac72-be41fd9c38f4	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	in_review	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:43.936071-04
91ffa28e-6dd2-4611-a8e9-22daab3bd0ff	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	done	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:45.229312-04
a416bdab-7070-4871-be66-7cd834cc55c5	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	done	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:46.232663-04
d47b676a-aa81-46d2-9f1f-c746f5aa8ccd	3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	done	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:47.0667-04
697528c4-9d97-4d54-957f-ed6f9cfc611f	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	in_progress	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:48.145256-04
68cc040b-3c7a-4a42-9975-83922f939d3c	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	assigned	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:49.229933-04
d5c5b4c9-d29e-454e-8fb8-e35070e82061	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	in_progress	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:50.321125-04
c89d6f50-a6ed-4fa5-bc92-b752aabe66cd	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	in_progress	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:51.505797-04
6e814fee-4e20-4658-b155-331f108b17df	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	assigned	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:53.633399-04
1655b1d3-0470-4e0c-8b94-3afb756027c2	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:55.269473-04
aa842a2b-0eb2-436e-8df9-0d1efd7f0139	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:56.333137-04
95e3f490-5848-40a1-95bf-f58caf9c75f2	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:57.328802-04
c8858866-aac5-47fc-9062-2b39ec150553	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:20:58.29959-04
08eb35a3-7a18-4bf3-9b56-0a22040c65f4	3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:21:00.788912-04
941ddaef-7cbd-4e2d-94d2-335138b50035	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	done	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:21:42.250317-04
a95bc48c-fab3-48fe-83cb-42952d725b7c	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	done	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:21:54.216334-04
3e23c62c-be81-4694-8981-523266819d0b	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	done	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:22:13.752303-04
09c3842c-9ff0-4acb-8eb9-ccddb8afa91a	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	assigned	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:22:19.791408-04
3f7e3970-6def-4e8c-857b-2096e6223577	7408e609-5561-4165-9561-e48a9d09e7f0	Traderverse	created	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:22:37.958217-04
19629d35-b05a-460f-8d93-013d1f466be9	e322967d-2a21-4030-b80e-b675750c2cd3	Traderverse	created	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:22:40.744968-04
cc43587b-bfda-4d43-bd3a-578c2f0d6b79	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	Traderverse	created	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:25:13.801605-04
2b17973a-5c9b-477e-a936-b053efb0bd7a	aadb98ee-3891-47da-976c-1c8bd07c9cea	Traderverse	created	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:25:15.466979-04
48992fb6-eafe-4f2d-88d8-58a184fedf34	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:36.716842-04
56e31c12-2b6e-4230-934a-a78380ac1359	e322967d-2a21-4030-b80e-b675750c2cd3	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:38.332292-04
e3bec829-822b-4240-9f3b-19340e7401ff	bd22b4fa-59ab-4cae-8280-768a3a0369c3	Traderverse	created	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:51.295361-04
82623107-e5ba-483c-88f3-08e05678fd11	aadb98ee-3891-47da-976c-1c8bd07c9cea	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:39.579502-04
bfcfdbc1-a53a-412b-94ee-ea129f8fa6fb	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:29:06.497734-04
8867af24-edb2-4804-9622-1c34f22c8ef6	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	in_progress	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:40.595139-04
b13142d1-b463-4c3f-914b-105541b61f72	3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	Traderverse	in_progress	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:46.611029-04
9783407e-e1c2-4b55-861a-260e0586e526	7408e609-5561-4165-9561-e48a9d09e7f0	Traderverse	in_progress	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:45.730117-04
ca834e1f-e1fd-41fc-aaea-ea32ee74b0f0	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	assigned	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:47.961084-04
978a9b05-641e-4242-b7e7-1998c2dbaebb	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	Traderverse	in_progress	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:29:00.952112-04
40cdd9aa-9d20-4245-8cab-9414dbc2624f	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	Traderverse	created	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:48.866697-04
9a69a9e0-9ec8-4bcd-ab72-f527b8129488	bd22b4fa-59ab-4cae-8280-768a3a0369c3	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:29:08.280499-04
272f96ba-fbcc-4fee-9060-09f67cd64037	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	Traderverse	created	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:28:49.979254-04
029ab703-d35b-4ffa-9823-37bfddc01971	5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:29:07.65975-04
6df462ea-83a8-49dd-94ef-0baf6feb21bb	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	Traderverse	in_review	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 10:29:07.081545-04
bfb0250f-b745-48e6-9c07-9b6301dbd252	d09d8307-d923-4959-93b5-8f723dc00d61	Traderboards	assigned	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 15:50:28.714325-04
82c0e12d-b351-4e36-9f4a-6503c5b6c34b	4ad03c6a-3029-44ce-bdd8-176d689d6f19	Traderboards	created	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 15:50:29.698163-04
47f9fac8-95fe-4a8a-915e-5f6f7a19007f	4fe43852-a5f5-49f5-bde0-669f6edc74ff	Traderboards	created	done	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-23 15:50:30.926659-04
4bb056a3-3ac0-44e9-aa5f-f43019486836	dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	done	assigned	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-24 07:21:31.094656-04
480fa93d-7f27-4620-8a2b-c6ff34327e9d	8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	done	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-24 07:21:32.370527-04
f714c26b-b919-4fb8-b6f0-d451da2e6245	292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	done	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-24 07:21:32.879264-04
ee509786-1d0c-4d49-aa15-d0bac4565780	8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	done	in_progress	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-24 07:21:34.04844-04
fc4f603c-1a8d-4e87-a40f-02224056f7ff	7408e609-5561-4165-9561-e48a9d09e7f0	Traderverse	done	created	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-24 07:21:35.375055-04
4457fb90-bb87-47ab-9bba-09286562ac06	8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	Traderverse	done	in_review	e13268f9-37dd-4875-87f3-cdb9ea780a40	2026-03-24 07:21:36.461213-04
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, product_id, initiative_id, item_id, delivery_id, title, description, status, priority, type, assignee_user_ids, created_by_user_id, estimate_value, dependent, blocked_reason, created_at, updated_at, started_at, completed_at, due_at, owner_user_id, reviewer_user_ids) FROM stdin;
8f3b0c65-c7e5-4aae-9c9c-8d098a1dfbf0	Traderboards	\N	3527df15-ef34-4f73-b75d-56af4b3374ac	6affc085-4599-4c6c-afcb-16dbd13b6b7c	Add password strength indicator	\N	done	medium	\N	{27e172b3-3a14-4ef4-b0b8-f26db20a6569}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.111368-04	2026-03-15 14:15:25.111368	\N	\N	\N	27e172b3-3a14-4ef4-b0b8-f26db20a6569	\N
1e211914-6025-4f09-b52d-058653c31c39	Traderboards	\N	1be3253a-d297-453e-aa3a-407cdbe08e98	6affc085-4599-4c6c-afcb-16dbd13b6b7c	Add swipe gestures for mobile nav	\N	created	low	\N	{4ae5533b-61b6-4a92-b433-b4dca6350d6a,27e172b3-3a14-4ef4-b0b8-f26db20a6569}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.117471-04	2026-03-15 14:15:25.117471	\N	\N	\N	4ae5533b-61b6-4a92-b433-b4dca6350d6a	\N
631c4444-ee99-4bae-9afc-cc4c963f9302	Traderboards	\N	48a7e6ae-c3bb-41c6-9493-321ea0024da0	6affc085-4599-4c6c-afcb-16dbd13b6b7c	Fix cart decimal precision bug	\N	in_review	critical	\N	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.119451-04	2026-03-15 14:15:25.119451	\N	\N	\N	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
6bbf4466-da53-422e-9fcd-a7f68310c5fe	Traderboards	\N	d739da6d-3a5b-4f29-b362-b05f51c5d57d	\N	Optimize dashboard chart rendering	\N	in_progress	high	\N	{27e172b3-3a14-4ef4-b0b8-f26db20a6569}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.124687-04	2026-03-15 14:15:25.124687	\N	\N	\N	27e172b3-3a14-4ef4-b0b8-f26db20a6569	\N
6167812a-f972-404d-ad46-d5207acdcb99	Traderboards	\N	d739da6d-3a5b-4f29-b362-b05f51c5d57d	\N	Lazy load dashboard widgets	\N	assigned	medium	\N	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.125842-04	2026-03-15 14:15:25.125842	\N	\N	\N	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
d2f71a4c-f717-4fbd-8179-492c1683b166	Traderverse	\N	683cd00b-3267-451a-b8fb-9f6d17c8800d	\N	keycloak email templates	custom template for custom domains	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	4	\N	\N	2026-03-22 07:47:09.21256-04	2026-03-22 07:47:09.21256	\N	\N	\N	\N	\N
e8adf32b-f441-4ae1-af26-9c4bcf3ea0c3	Traderverse	\N	d687e33c-5d6d-474b-9a0b-3f9143d31ac4	\N	Add responsive hamburger menu	\N	in_progress	medium	development	{4ae5533b-61b6-4a92-b433-b4dca6350d6a}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.097953-04	2026-03-16 16:06:23.541	\N	\N	\N	4ae5533b-61b6-4a92-b433-b4dca6350d6a	\N
ee620d60-ed8e-4f2c-baa3-8c78ebc6878e	Traderverse	\N	d687e33c-5d6d-474b-9a0b-3f9143d31ac4	\N	Test mobile navigation on iOS Safari	\N	assigned	low	review	{27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.10008-04	2026-03-16 16:06:27.792	\N	\N	\N	27e172b3-3a14-4ef4-b0b8-f26db20a6569	\N
3851590a-199f-4d29-b718-c67760dd7bd1	Traderverse	\N	852356c6-1387-4b54-8072-e2034795b4a1	0c02b2d0-990c-4768-a743-bef847263125	Add rate limit headers to API responses	\N	done	medium	research	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.092385-04	2026-03-23 14:28:08.911	2026-03-23 14:13:55.051	2026-03-23 14:21:00.783	2026-03-30 12:00:00	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
aadb98ee-3891-47da-976c-1c8bd07c9cea	Traderverse	\N	5bb14c68-4b84-4440-85f2-780f26ff1334	0c02b2d0-990c-4768-a743-bef847263125	telegram connection	after auth its ask for connection to connect	done	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	4	\N	\N	2026-03-22 07:49:41.651397-04	2026-03-24 11:26:39.105	\N	2026-03-23 14:28:39.575	2026-03-26 12:00:00	\N	\N
a1cec26e-ce9d-406a-865d-066d659c0739	Traderverse	\N	8c51e6d6-ed3a-4e23-bb7b-95ceaea3691d	4703a4d1-c962-4f91-8f8e-58f9176cdad2	Fix email HTML template rendering	\N	done	medium	fix	{4ae5533b-61b6-4a92-b433-b4dca6350d6a}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.082377-04	2026-03-16 16:08:50.483	\N	\N	\N	4ae5533b-61b6-4a92-b433-b4dca6350d6a	\N
4d70223f-2b91-44be-8168-a650e96dcf42	Traderverse	\N	8c51e6d6-ed3a-4e23-bb7b-95ceaea3691d	4703a4d1-c962-4f91-8f8e-58f9176cdad2	Add email preview in admin panel	\N	in_review	low	deployment	{4ae5533b-61b6-4a92-b433-b4dca6350d6a,aa2af4f7-c10c-40f0-858b-ea7c02ace2ad}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.084926-04	2026-03-16 16:08:52.167	\N	\N	\N	4ae5533b-61b6-4a92-b433-b4dca6350d6a	\N
1d5b6c18-2ba2-40e4-bc4f-5c0990af065d	Traderverse	\N	683cd00b-3267-451a-b8fb-9f6d17c8800d	\N	keycloak centralizer dispatch system	SMTP server where keycloak events are sent out from	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	6	\N	\N	2026-03-22 07:47:41.01885-04	2026-03-22 07:47:41.01885	\N	\N	\N	\N	\N
3c50f3fd-4a37-4bc5-8e91-be40d7a18b05	Traderverse	\N	5bb14c68-4b84-4440-85f2-780f26ff1334	0c02b2d0-990c-4768-a743-bef847263125	discord connection	after auth its ask for a channel to connect	done	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	2	\N	\N	2026-03-22 07:49:24.27951-04	2026-03-23 19:57:11.844	2026-03-23 14:25:13.797	2026-03-23 14:28:46.607	2026-03-25 12:00:00	\N	\N
6db740fc-6cee-4a2f-a006-20e2227f6d52	Traderverse	\N	07190179-695b-49b7-819d-c8cdbf303d6a	4703a4d1-c962-4f91-8f8e-58f9176cdad2	Add unit tests for cart calculations	\N	assigned	high	documentation	{27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.080347-04	2026-03-16 16:18:30.439	\N	\N	\N	27e172b3-3a14-4ef4-b0b8-f26db20a6569	\N
772b419d-4ad0-4bd0-896f-759abab890e7	Traderverse	\N	8aa75e70-64eb-45ba-a764-cb2023c9b19c	\N	Design OAuth2 login flow mockups	\N	in_progress	medium	fix	{0125e173-4915-4abc-98ea-10929a901f54}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.093903-04	2026-03-16 16:18:35.226	\N	\N	\N	0125e173-4915-4abc-98ea-10929a901f54	\N
bbc36c7d-6c05-40ab-a26f-d77640f986d2	Traderverse	\N	8aa75e70-64eb-45ba-a764-cb2023c9b19c	\N	Implement JWT refresh token rotation	\N	assigned	high	fix	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad,27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.096236-04	2026-03-16 16:18:37.205	\N	\N	\N	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
07e14e97-c7d8-4325-8fd0-8017e0ea6de3	Traderverse	\N	ac6513a0-330f-4609-9e62-deb45cd78b8d	\N	SnapTrade API integration testing	\N	assigned	high	research	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.103574-04	2026-03-16 16:18:41.05	\N	\N	\N	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
7408e609-5561-4165-9561-e48a9d09e7f0	Traderverse	\N	62117f49-9b8b-4e70-a0b2-93e76936d62b	0c02b2d0-990c-4768-a743-bef847263125	setup NATS with auth	\N	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-19 17:19:19.483223-04	2026-03-24 11:21:35.369	2026-03-23 14:22:37.954	\N	2026-03-24 12:00:00	\N	\N
dfe77003-7b4a-4278-8d62-710f1c009a2e	Traderverse	\N	60aa978e-835c-422f-84b2-c50bdb3605d5	0c02b2d0-990c-4768-a743-bef847263125	Profile database queries for N+1	\N	assigned	high	documentation	{27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.087661-04	2026-03-24 11:21:31.088	2026-03-16 17:39:48.549	\N	2026-03-28 00:00:00	27e172b3-3a14-4ef4-b0b8-f26db20a6569	{1aa317fa-d752-445e-9fe5-20bf6397cae2}
56bfb6d1-2505-4280-89ab-40149c3d103b	Traderverse	\N	34d9c9d8-42b4-4076-a54c-52909ff304e7	\N	create etrade test server	setup etrade account and connect it	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	12	\N	\N	2026-03-18 06:56:33.461382-04	2026-03-18 06:56:33.461382	\N	\N	\N	\N	\N
434ece88-5500-4fad-a73c-b3e10d0b21cc	Traderverse	\N	683cd00b-3267-451a-b8fb-9f6d17c8800d	\N	use some SSO technology	some opensource SSO technology would be great	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	10	\N	\N	2026-03-22 07:39:24.110708-04	2026-03-22 07:39:24.110708	\N	\N	\N	\N	\N
5db27018-9f8d-42be-9ba1-790b3f76bf8c	Traderverse	\N	683cd00b-3267-451a-b8fb-9f6d17c8800d	\N	implement keycloak	install and start keycloak in a seperatet server	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	5	\N	\N	2026-03-22 07:45:10.348104-04	2026-03-22 07:45:10.348104	\N	\N	\N	\N	\N
c21ee4e4-3d9c-4c60-91ed-cb3f1b90d7bc	Traderverse	\N	683cd00b-3267-451a-b8fb-9f6d17c8800d	\N	unique verified links	unique verifieable links by domain name for users to verify there emails	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	2	\N	\N	2026-03-22 07:48:16.565523-04	2026-03-22 07:48:16.565523	\N	\N	\N	\N	\N
3352eb1f-ce29-40c8-963c-23dba0f0f1a3	Traderverse	\N	5bb14c68-4b84-4440-85f2-780f26ff1334	\N	reddit connection	after connection it ask for community to connect	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	4	\N	\N	2026-03-22 07:49:57.100286-04	2026-03-22 07:49:57.100286	\N	\N	\N	\N	\N
8fdc3f38-bc2a-4501-9a7b-6e53e9ec128a	Traderverse	\N	62117f49-9b8b-4e70-a0b2-93e76936d62b	0c02b2d0-990c-4768-a743-bef847263125	add message broker	any broker	in_review	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	24	\N	\N	2026-03-19 17:19:54.463389-04	2026-03-24 11:21:36.457	2026-03-23 14:28:48.862	\N	\N	\N	\N
5ef82ea2-ddd8-4f44-b8c8-d1e5bc388f0e	Traderverse	\N	62117f49-9b8b-4e70-a0b2-93e76936d62b	0c02b2d0-990c-4768-a743-bef847263125	zoom in	\N	done	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-19 17:23:42.945458-04	2026-03-24 11:26:41.509	\N	2026-03-23 14:29:07.656	2026-03-25 12:00:00	\N	\N
4ad03c6a-3029-44ce-bdd8-176d689d6f19	Traderboards	\N	a00d7080-09bf-4df6-87ed-9a56909787f0	2ec044fa-adf9-480d-98a2-c1deb67d433d	Design dark mode color palette	\N	done	medium	\N	{0125e173-4915-4abc-98ea-10929a901f54,e13268f9-37dd-4875-87f3-cdb9ea780a40}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.121673-04	2026-03-23 19:50:40.85	\N	2026-03-23 19:50:29.694	\N	0125e173-4915-4abc-98ea-10929a901f54	\N
e322967d-2a21-4030-b80e-b675750c2cd3	Traderverse	\N	62117f49-9b8b-4e70-a0b2-93e76936d62b	0c02b2d0-990c-4768-a743-bef847263125	add cache layer using couche db	create a local couce db instance	done	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	4	\N	\N	2026-03-19 17:22:45.113378-04	2026-03-24 11:26:38.153	\N	2026-03-23 14:28:38.328	2026-03-28 12:00:00	\N	\N
094553d1-30cd-467d-92a3-1d531fed63e5	Traderboards	\N	3527df15-ef34-4f73-b75d-56af4b3374ac	6affc085-4599-4c6c-afcb-16dbd13b6b7c	Implement SSO with Google OAuth	\N	in_progress	high	\N	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad,e13268f9-37dd-4875-87f3-cdb9ea780a40}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.108321-04	2026-03-23 19:49:54.699	\N	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N
57f5bfa9-dd3a-4c07-82e5-06726e0c73d3	Traderboards	\N	1be3253a-d297-453e-aa3a-407cdbe08e98	6affc085-4599-4c6c-afcb-16dbd13b6b7c	Fix mobile sidebar collapse animation	\N	in_progress	medium	\N	{4ae5533b-61b6-4a92-b433-b4dca6350d6a,e13268f9-37dd-4875-87f3-cdb9ea780a40}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.11386-04	2026-03-23 19:50:09.56	\N	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N
4fe43852-a5f5-49f5-bde0-669f6edc74ff	Traderboards	\N	a00d7080-09bf-4df6-87ed-9a56909787f0	2ec044fa-adf9-480d-98a2-c1deb67d433d	Implement CSS variable theming system	\N	done	medium	\N	{27e172b3-3a14-4ef4-b0b8-f26db20a6569,4ae5533b-61b6-4a92-b433-b4dca6350d6a,e13268f9-37dd-4875-87f3-cdb9ea780a40}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.122679-04	2026-03-23 19:50:46.169	\N	2026-03-23 19:50:30.924	\N	27e172b3-3a14-4ef4-b0b8-f26db20a6569	\N
e293c039-129b-4e32-b794-d5fc485a570e	Traderverse	\N	07190179-695b-49b7-819d-c8cdbf303d6a	4703a4d1-c962-4f91-8f8e-58f9176cdad2	Fix cart quantity update race condition	\N	in_progress	critical	deployment	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad,27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	12	{e8adf32b-f441-4ae1-af26-9c4bcf3ea0c3,8b920bf9-65df-4c67-ad05-3a622a846237}	\N	2026-03-15 14:15:25.074949-04	2026-03-24 11:16:47.475	\N	\N	2026-03-31 00:00:00	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
d09d8307-d923-4959-93b5-8f723dc00d61	Traderboards	\N	9b3ec16e-9835-4cd6-81fd-421569be8701	2ec044fa-adf9-480d-98a2-c1deb67d433d	Evaluate Algolia vs Elasticsearch	\N	done	medium	\N	{09a66b1e-b9e8-45b4-b2a9-8076c72929b9,0125e173-4915-4abc-98ea-10929a901f54,e13268f9-37dd-4875-87f3-cdb9ea780a40}	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	\N	\N	2026-03-15 14:15:25.120499-04	2026-03-23 19:50:35.954	\N	2026-03-23 19:50:28.709	\N	09a66b1e-b9e8-45b4-b2a9-8076c72929b9	\N
27fc8f20-6708-4442-bfff-00d655acc600	Traderverse	\N	5bb14c68-4b84-4440-85f2-780f26ff1334	\N	slack connection	slack connection to enterprise account	created	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	4	\N	\N	2026-03-22 07:50:31.634796-04	2026-03-22 07:50:31.634796	\N	\N	\N	\N	\N
8453ea4f-61d3-48bf-90af-1878d9dbd27a	Traderverse	\N	60aa978e-835c-422f-84b2-c50bdb3605d5	0c02b2d0-990c-4768-a743-bef847263125	Add Redis caching for dashboard widgets	\N	in_review	high	documentation	{aa2af4f7-c10c-40f0-858b-ea7c02ace2ad,27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.089549-04	2026-03-24 11:21:32.363	2026-03-23 14:20:49.227	\N	2026-03-26 12:00:00	aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	\N
292e7b3a-725b-4781-800b-488ff7ee8e0d	Traderverse	\N	852356c6-1387-4b54-8072-e2034795b4a1	0c02b2d0-990c-4768-a743-bef847263125	Implement sliding window rate limiter	\N	in_progress	high	research	{27e172b3-3a14-4ef4-b0b8-f26db20a6569}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.090939-04	2026-03-24 11:21:32.873	2026-03-24 11:21:32.873	\N	2026-03-24 12:00:00	27e172b3-3a14-4ef4-b0b8-f26db20a6569	\N
8b920bf9-65df-4c67-ad05-3a622a846237	Traderverse	\N	34d36cc8-0181-4f8a-9f81-f1e5d4802fb2	0c02b2d0-990c-4768-a743-bef847263125	Research GDPR data retention policies	\N	in_progress	medium	design	{0125e173-4915-4abc-98ea-10929a901f54,09a66b1e-b9e8-45b4-b2a9-8076c72929b9}	e13268f9-37dd-4875-87f3-cdb9ea780a40	\N	\N	\N	2026-03-15 14:15:25.101593-04	2026-03-24 11:21:34.043	2026-03-24 11:21:34.043	\N	2026-03-29 12:00:00	0125e173-4915-4abc-98ea-10929a901f54	\N
bd22b4fa-59ab-4cae-8280-768a3a0369c3	Traderverse	\N	5bb14c68-4b84-4440-85f2-780f26ff1334	0c02b2d0-990c-4768-a743-bef847263125	whatsapp	twilio api exploration	done	medium	\N	\N	e13268f9-37dd-4875-87f3-cdb9ea780a40	4	\N	\N	2026-03-22 07:50:07.846209-04	2026-03-24 11:26:40.363	\N	2026-03-23 14:29:08.277	2026-03-27 12:00:00	\N	\N
\.


--
-- Data for Name: test_cycle_issues; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.test_cycle_issues (id, test_cycle_id, title, description, severity, status, story_id, reported_by_user_id, assigned_to_user_id, created_at, updated_at) FROM stdin;
24b03b15-bc66-44b5-b789-75b77b0a6a3d	6be621e5-1960-40e2-8c78-4591ca42c344	Dashboard stats show NaN for new products	\N	major	open	\N	56d4291a-715d-425f-a201-8a029e67ab37	\N	2026-03-22 10:14:43.369359-04	2026-03-22 10:14:43.369359-04
d71ea0fa-3d47-4344-97a0-e0a2f3639797	6be621e5-1960-40e2-8c78-4591ca42c344	Avatar upload fails for WEBP format	\N	minor	resolved	\N	191d69c7-3274-4f10-b27f-d74635020d75	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-22 10:14:43.369359-04	2026-03-22 10:14:43.369359-04
19b17ec7-dec0-457a-ac32-44b4a22d8f5b	6be621e5-1960-40e2-8c78-4591ca42c344	Sidebar flickers on route change	\N	trivial	closed	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	2026-03-22 10:14:43.369359-04	2026-03-22 10:14:43.369359-04
e3f6da45-e7bc-4542-a5ff-04c54fb1b010	4570c69c-1e8e-4f43-a701-21fafc04a3b9	Password reset email not sent	\N	critical	resolved	247bf31c-c932-4c06-acde-baca0fcb6814	1aa317fa-d752-445e-9fe5-20bf6397cae2	191d69c7-3274-4f10-b27f-d74635020d75	2026-03-22 10:14:43.373538-04	2026-03-22 10:14:43.373538-04
f052c1c0-f47c-44b7-98a3-c5bf42fee888	4570c69c-1e8e-4f43-a701-21fafc04a3b9	Team member role not saving	\N	major	closed	\N	56d4291a-715d-425f-a201-8a029e67ab37	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-22 10:14:43.373538-04	2026-03-22 10:14:43.373538-04
de9e1b36-49f2-43d9-8a3f-7b139440b81a	4570c69c-1e8e-4f43-a701-21fafc04a3b9	Mobile nav menu z-index issue	\N	minor	closed	\N	191d69c7-3274-4f10-b27f-d74635020d75	\N	2026-03-22 10:14:43.373538-04	2026-03-22 10:14:43.373538-04
79e6c576-8a30-4f9f-b93f-cca2cfe942d3	617bf9a4-904c-4800-83d7-e579707209c4	App crashes on empty DB	\N	critical	closed	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	\N	2026-03-22 10:14:43.377027-04	2026-03-22 10:14:43.377027-04
450ea5c6-4ea2-4971-96bd-58cb10848f3c	617bf9a4-904c-4800-83d7-e579707209c4	Missing 404 page	\N	minor	deferred	\N	191d69c7-3274-4f10-b27f-d74635020d75	\N	2026-03-22 10:14:43.377027-04	2026-03-22 10:14:43.377027-04
0b92bdb2-62ca-468f-b6c7-0c236eef7e81	6be621e5-1960-40e2-8c78-4591ca42c344	Login form resets on tab switch	\N	major	in_progress	25d0e68c-2e7e-45d1-b5a8-e55f8fc57ae8	191d69c7-3274-4f10-b27f-d74635020d75	\N	2026-03-22 10:14:43.369359-04	2026-03-24 07:35:15.534-04
93cb7869-4768-4713-a7c3-e37ad11eb798	6be621e5-1960-40e2-8c78-4591ca42c344	Search results not clearing on empty query	\N	minor	open	\N	1aa317fa-d752-445e-9fe5-20bf6397cae2	56d4291a-715d-425f-a201-8a029e67ab37	2026-03-22 10:14:43.369359-04	2026-03-24 07:35:16.839-04
\.


--
-- Data for Name: test_cycles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.test_cycles (id, title, description, status, delivery_id, release_id, product_id, start_date, end_date, created_by_user_id, created_at, updated_at) FROM stdin;
6be621e5-1960-40e2-8c78-4591ca42c344	#1 Sprint 5 Regression	Full regression testing for Sprint 5 delivery including auth flow, navigation, and search.	in_progress	4703a4d1-c962-4f91-8f8e-58f9176cdad2	\N	Traderverse	2026-03-15	2026-03-22	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-22 10:14:43.366467-04	2026-03-22 10:14:43.366467-04
4570c69c-1e8e-4f43-a701-21fafc04a3b9	#2 Release 1.0.0 UAT	User acceptance testing for the initial production release.	completed	\N	8e9dba6e-a57a-4806-bcf6-9d2e33a14570	Traderverse	2026-02-18	2026-02-24	191d69c7-3274-4f10-b27f-d74635020d75	2026-03-22 10:14:43.371605-04	2026-03-22 10:14:43.371605-04
5fe8c674-0df8-4a32-8005-55ff45a752e1	#3 Performance Load Test	Load testing for API endpoints under 500 concurrent users.	planned	\N	\N	Traderverse	2026-03-25	2026-03-28	1aa317fa-d752-445e-9fe5-20bf6397cae2	2026-03-22 10:14:43.375034-04	2026-03-22 10:14:43.375034-04
617bf9a4-904c-4800-83d7-e579707209c4	#4 Alpha Smoke Test	Initial smoke testing during alpha phase.	archived	\N	\N	Traderverse	2026-01-10	2026-01-12	56d4291a-715d-425f-a201-8a029e67ab37	2026-03-22 10:14:43.375869-04	2026-03-22 10:14:43.375869-04
\.


--
-- Data for Name: user_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_settings (id, user_id, key, value, updated_at) FROM stdin;
31841c97-abb7-401e-b343-f48731d2960c	e13268f9-37dd-4875-87f3-cdb9ea780a40	team-view-mode	"table"	2026-03-23 20:48:20.289
2aeee03e-401f-4cdb-ba61-03edb5332624	e13268f9-37dd-4875-87f3-cdb9ea780a40	stories-view-mode	"table"	2026-03-24 11:11:34.125
a47248ad-9548-4111-9880-fe5d62a09437	e13268f9-37dd-4875-87f3-cdb9ea780a40	tasks-column-widths	{"title":602,"status":120,"priority":100,"type":110,"story":617,"owner":140,"assignees":99,"reviewers":160,"estimate":90,"dueAt":110,"description":200,"createdBy":140,"comments":87,"attachments":70,"dependent":89,"createdAt":152,"updatedAt":100,"startedAt":100,"completedAt":100,"blockedReason":160}	2026-03-24 11:18:20.661
8de47a0d-860a-4c79-92ed-77cb4b45a023	e13268f9-37dd-4875-87f3-cdb9ea780a40	stories-column-widths	{"title":353,"status":120,"priority":116,"type":137,"initiative":630,"owner":160,"tasks":179,"estimate":90,"delivery":110,"description":200,"acceptanceCriteria":200,"createdAt":100,"updatedAt":100}	2026-03-24 11:08:58.967
c893746c-3888-4862-be1a-f0fe826e0cbd	e13268f9-37dd-4875-87f3-cdb9ea780a40	tasks-column-config	[{"field":"title","label":"Title","width":"1fr","visible":true},{"field":"status","label":"Status","width":"120px","visible":true},{"field":"priority","label":"Priority","width":"100px","visible":true},{"field":"type","label":"Type","width":"110px","visible":true},{"field":"dependent","label":"Dependent","width":"140px","visible":true},{"field":"story","label":"Story","width":"160px","visible":true},{"field":"owner","label":"Owner","width":"140px","visible":false},{"field":"assignees","label":"Assignees","width":"160px","visible":true},{"field":"reviewers","label":"Reviewers","width":"160px","visible":false},{"field":"estimate","label":"Estimate","width":"90px","visible":false},{"field":"comments","label":"Comments","width":"80px","visible":true},{"field":"dueAt","label":"Due Date","width":"110px","visible":false},{"field":"description","label":"Description","width":"200px","visible":false},{"field":"createdBy","label":"Created By","width":"140px","visible":false},{"field":"createdAt","label":"Created","width":"100px","visible":true},{"field":"updatedAt","label":"Updated","width":"100px","visible":false},{"field":"startedAt","label":"Started","width":"100px","visible":false},{"field":"completedAt","label":"Completed","width":"100px","visible":false},{"field":"blockedReason","label":"Blocked Reason","width":"160px","visible":false},{"field":"attachments","label":"Files","width":"70px","visible":true}]	2026-03-24 11:48:28.256
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password, role, avatar, created_at, updated_at) FROM stdin;
1aa317fa-d752-445e-9fe5-20bf6397cae2	Elena Petrova	elena@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	super_admin	https://images.unsplash.com/photo-1629425733761-caae3b5f2e50?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.911165-04	2026-03-15 13:06:42.911165-04
191d69c7-3274-4f10-b27f-d74635020d75	David Kim	david@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	super_admin	https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.91301-04	2026-03-15 13:06:42.91301-04
56d4291a-715d-425f-a201-8a029e67ab37	James Rodriguez	james@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	admin	https://images.unsplash.com/photo-1595211877493-41a4e5f236b3?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.919914-04	2026-03-15 13:06:42.919914-04
fb3c9346-7f43-4699-82d2-3530e23053ca	Aisha Patel	aisha@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	admin	https://images.unsplash.com/photo-1655249481446-25d575f1c054?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.921486-04	2026-03-15 13:06:42.921486-04
eedcd8d5-eae8-4e39-8a55-de9bad91b316	Rachel Green	rachel@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	product_admin	https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.922696-04	2026-03-15 13:06:42.922696-04
17734b85-b69f-4072-ad5b-e2119322972e	Thomas Wright	thomas@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	product_admin	https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.924379-04	2026-03-15 13:06:42.924379-04
0125e173-4915-4abc-98ea-10929a901f54	Olivia Taylor	olivia@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	product_manager	https://images.unsplash.com/photo-1685760259914-ee8d2c92d2e0?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.927582-04	2026-03-15 13:06:42.927582-04
09a66b1e-b9e8-45b4-b2a9-8076c72929b9	Nathan Brooks	nathan@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	product_manager	https://images.unsplash.com/photo-1701096374092-bb70915fdc5c?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.928331-04	2026-03-15 13:06:42.928331-04
0d06a0f8-abc6-434c-87e6-78cc8ff38871	Sofia Martinez	sofia@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	product_manager	https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.929165-04	2026-03-15 13:06:42.929165-04
1c42831f-7678-47a6-a48b-464096c442df	Maya Johnson	maya@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	business_analyst	https://images.unsplash.com/photo-1627161683077-e34782c24d81?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.931539-04	2026-03-15 13:06:42.931539-04
fa151e69-38ba-45ff-94e7-4f66128cfe0b	Daniel Lee	daniel@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	business_analyst	https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.932822-04	2026-03-15 13:06:42.932822-04
aa2af4f7-c10c-40f0-858b-ea7c02ace2ad	Emma Wilson	emma@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	developer	https://images.unsplash.com/photo-1652471943570-f3590a4e52ed?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.933772-04	2026-03-15 13:06:42.933772-04
27e172b3-3a14-4ef4-b0b8-f26db20a6569	Ryan Chang	ryan@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	developer	https://images.unsplash.com/photo-1573496358961-3c82861ab8f4?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.934754-04	2026-03-15 13:06:42.934754-04
cee0cfc3-e0cf-42a3-8525-ced3c2c8b6ab	Alex Turner	alex@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	viewer	https://images.unsplash.com/photo-1652471949169-9c587e8898cd?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.936393-04	2026-03-15 13:06:42.936393-04
99090b9a-f180-45e7-9d0f-60fc5bab3e93	Zara Ahmed	zara@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	viewer	https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.937471-04	2026-03-15 13:06:42.937471-04
bdd8ca98-ad8d-4618-8a58-d10abc41cbe0	Chris Nakamura	chris@productier.com	$2b$10$k.p/pQH32QjyLupiyWADseyU2KXcaJs2IcaL5i.b32kDwcEBzNcZq	viewer	https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face	2026-03-15 13:08:37.207162-04	2026-03-15 13:08:37.207162-04
3254d6ac-8a2c-43b1-8fba-c4db8de50e7c	Marcus Chen	marcus@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	super_admin	https://images.unsplash.com/photo-1611432579402-7037e3e2c1e4?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.907497-04	2026-03-15 13:44:16.285-04
5721e208-6257-44a9-8b16-cfc9c231c796	Sarah Mitchell	sarah@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	admin	https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.918097-04	2026-03-15 13:44:16.313-04
d2d3cb0c-7324-4f0f-824e-94931325a97e	Priya Sharma	priya@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	product_admin	https://images.unsplash.com/photo-1558222218-b7b54eede3f3?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.925348-04	2026-03-15 13:44:16.316-04
f27f6730-8197-4e9e-a97f-dde19eaae432	Liam Foster	liam@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	business_analyst	https://images.unsplash.com/photo-1618491609764-0dc04604a02a?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.930156-04	2026-03-15 13:44:16.318-04
4ae5533b-61b6-4a92-b433-b4dca6350d6a	Isabella Garcia	isabella@productier.com	$2b$10$iVYx6AA0.WXVwnwcixAfmeHbiTLPVwhFeqlPRoFbEQ8tB6tybDcpW	developer	https://images.unsplash.com/photo-1613742743080-a59851f3008d?w=200&h=200&fit=crop&crop=face	2026-03-15 13:06:42.935419-04	2026-03-15 13:44:16.32-04
18e2f424-4861-46e7-96a6-4440ea06f786	Admin User	admin@productier.com	$2b$10$5SEWLsi02UQQRWmwPxQzXegyINJ1XWfbfzYqGkrDEwGtB4pzF0Gl6	super_admin	https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=200&h=200&fit=crop&crop=face	2026-03-15 12:53:09.190767-04	2026-03-15 13:44:16.321-04
e13268f9-37dd-4875-87f3-cdb9ea780a40	Sarim Alavi	sarim@productier.com	$2b$10$Bz2S/aXbSW5fcmpuxAnPK.3PY3b0ghXgGAi11561ERXRMXh9yYPjq	admin	/uploads/avatars/e13268f9-37dd-4875-87f3-cdb9ea780a40-1773831279255.jpg	2026-03-15 13:10:02.402987-04	2026-03-18 06:54:39.257-04
\.


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: asset_relations asset_relation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_relations
    ADD CONSTRAINT asset_relation_unique UNIQUE (source_asset_id, target_asset_id, relation_type);


--
-- Name: asset_relations asset_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_relations
    ADD CONSTRAINT asset_relations_pkey PRIMARY KEY (id);


--
-- Name: asset_types asset_type_slug_product_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_type_slug_product_unique UNIQUE (slug, product_id);


--
-- Name: asset_types asset_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: backlog_items backlog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backlog_items
    ADD CONSTRAINT backlog_items_pkey PRIMARY KEY (id);


--
-- Name: deliveries deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_pkey PRIMARY KEY (id);


--
-- Name: delivery_initiatives delivery_initiative_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_initiatives
    ADD CONSTRAINT delivery_initiative_unique UNIQUE (delivery_id, initiative_id);


--
-- Name: delivery_initiatives delivery_initiatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_initiatives
    ADD CONSTRAINT delivery_initiatives_pkey PRIMARY KEY (id);


--
-- Name: deployment_targets deployment_target_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_targets
    ADD CONSTRAINT deployment_target_unique UNIQUE (release_deployment_id, server_id);


--
-- Name: deployment_targets deployment_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_targets
    ADD CONSTRAINT deployment_targets_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: initiatives initiatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initiatives
    ADD CONSTRAINT initiatives_pkey PRIMARY KEY (id);


--
-- Name: product_members product_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_members
    ADD CONSTRAINT product_members_pkey PRIMARY KEY (id);


--
-- Name: product_members product_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_members
    ADD CONSTRAINT product_user_unique UNIQUE (product, user_id);


--
-- Name: products products_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_name_unique UNIQUE (name);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: release_deliveries release_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deliveries
    ADD CONSTRAINT release_deliveries_pkey PRIMARY KEY (id);


--
-- Name: release_deliveries release_delivery_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deliveries
    ADD CONSTRAINT release_delivery_unique UNIQUE (release_id, delivery_id);


--
-- Name: release_deployments release_deployment_env_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deployments
    ADD CONSTRAINT release_deployment_env_unique UNIQUE (release_id, environment);


--
-- Name: release_deployments release_deployments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deployments
    ADD CONSTRAINT release_deployments_pkey PRIMARY KEY (id);


--
-- Name: releases releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releases
    ADD CONSTRAINT releases_pkey PRIMARY KEY (id);


--
-- Name: servers servers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_pkey PRIMARY KEY (id);


--
-- Name: story_comments story_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_comments
    ADD CONSTRAINT story_comments_pkey PRIMARY KEY (id);


--
-- Name: task_attachments task_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_pkey PRIMARY KEY (id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: task_status_history task_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_status_history
    ADD CONSTRAINT task_status_history_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: test_cycle_issues test_cycle_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycle_issues
    ADD CONSTRAINT test_cycle_issues_pkey PRIMARY KEY (id);


--
-- Name: test_cycles test_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycles
    ADD CONSTRAINT test_cycles_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_unique UNIQUE (user_id, key);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: favorites_user_entity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX favorites_user_entity_unique ON public.favorites USING btree (user_id, entity_type, entity_id);


--
-- Name: favorites_user_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX favorites_user_product_idx ON public.favorites USING btree (user_id, product_id);


--
-- Name: idx_asset_types_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asset_types_product ON public.asset_types USING btree (product_id);


--
-- Name: idx_assets_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_parent ON public.assets USING btree (parent_id);


--
-- Name: idx_assets_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_product ON public.assets USING btree (product_id);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_status ON public.assets USING btree (status);


--
-- Name: idx_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_type ON public.assets USING btree (asset_type_id);


--
-- Name: idx_task_status_history_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_status_history_product ON public.task_status_history USING btree (product_id);


--
-- Name: idx_task_status_history_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_status_history_task_id ON public.task_status_history USING btree (task_id);


--
-- Name: activities activities_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: asset_relations asset_relations_source_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_relations
    ADD CONSTRAINT asset_relations_source_asset_id_fkey FOREIGN KEY (source_asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_relations asset_relations_target_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_relations
    ADD CONSTRAINT asset_relations_target_asset_id_fkey FOREIGN KEY (target_asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id) ON DELETE CASCADE;


--
-- Name: assets assets_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: assets assets_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- Name: assets assets_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: deliveries deliveries_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: delivery_initiatives delivery_initiatives_delivery_id_deliveries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_initiatives
    ADD CONSTRAINT delivery_initiatives_delivery_id_deliveries_id_fk FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;


--
-- Name: delivery_initiatives delivery_initiatives_initiative_id_initiatives_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_initiatives
    ADD CONSTRAINT delivery_initiatives_initiative_id_initiatives_id_fk FOREIGN KEY (initiative_id) REFERENCES public.initiatives(id) ON DELETE CASCADE;


--
-- Name: deployment_targets deployment_targets_release_deployment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_targets
    ADD CONSTRAINT deployment_targets_release_deployment_id_fkey FOREIGN KEY (release_deployment_id) REFERENCES public.release_deployments(id) ON DELETE CASCADE;


--
-- Name: deployment_targets deployment_targets_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_targets
    ADD CONSTRAINT deployment_targets_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id);


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: product_members product_members_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_members
    ADD CONSTRAINT product_members_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: products products_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: release_deliveries release_deliveries_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deliveries
    ADD CONSTRAINT release_deliveries_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id) ON DELETE CASCADE;


--
-- Name: release_deliveries release_deliveries_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deliveries
    ADD CONSTRAINT release_deliveries_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: release_deployments release_deployments_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_deployments
    ADD CONSTRAINT release_deployments_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id) ON DELETE CASCADE;


--
-- Name: story_comments story_comments_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_comments
    ADD CONSTRAINT story_comments_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.backlog_items(id) ON DELETE CASCADE;


--
-- Name: story_comments story_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_comments
    ADD CONSTRAINT story_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: task_attachments task_attachments_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_attachments task_attachments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: task_comments task_comments_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: task_status_history task_status_history_changed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_status_history
    ADD CONSTRAINT task_status_history_changed_by_user_id_users_id_fk FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id);


--
-- Name: task_status_history task_status_history_task_id_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_status_history
    ADD CONSTRAINT task_status_history_task_id_tasks_id_fk FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: tasks tasks_item_id_backlog_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_item_id_backlog_items_id_fk FOREIGN KEY (item_id) REFERENCES public.backlog_items(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_owner_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_owner_user_id_users_id_fk FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- Name: test_cycle_issues test_cycle_issues_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycle_issues
    ADD CONSTRAINT test_cycle_issues_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id);


--
-- Name: test_cycle_issues test_cycle_issues_reported_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycle_issues
    ADD CONSTRAINT test_cycle_issues_reported_by_user_id_fkey FOREIGN KEY (reported_by_user_id) REFERENCES public.users(id);


--
-- Name: test_cycle_issues test_cycle_issues_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycle_issues
    ADD CONSTRAINT test_cycle_issues_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.backlog_items(id);


--
-- Name: test_cycle_issues test_cycle_issues_test_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycle_issues
    ADD CONSTRAINT test_cycle_issues_test_cycle_id_fkey FOREIGN KEY (test_cycle_id) REFERENCES public.test_cycles(id) ON DELETE CASCADE;


--
-- Name: test_cycles test_cycles_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycles
    ADD CONSTRAINT test_cycles_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: test_cycles test_cycles_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycles
    ADD CONSTRAINT test_cycles_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.deliveries(id);


--
-- Name: test_cycles test_cycles_release_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_cycles
    ADD CONSTRAINT test_cycles_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.releases(id);


--
-- Name: user_settings user_settings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 3R2F8m8pARXxa1tP0eSkZs6RqcttWHW6wcYcSeZ34jZ73Euk679LGCNFsA27OB3

