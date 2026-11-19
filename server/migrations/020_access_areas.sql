-- Finer access: which sections of a project a person can open, and whether an organization
-- member reaches every project or only the ones they were added to.
--
-- Sections ("areas"): research = studies, documents, insights, participants and reports;
--                     tickets  = tickets, milestones, roadmap and the feedback widget.
-- Existing people keep exactly what they had: both areas, every project, commenter.

alter table project_members add column if not exists areas text[] not null default '{research,tickets}';
alter table project_members drop constraint if exists project_members_areas_check;
alter table project_members add constraint project_members_areas_check check (areas <@ array['research','tickets'] and cardinality(areas) > 0);

-- For organization members (role = 'member'). Owners and admins always have everything.
-- all_projects = false: the person only reaches the projects they are a collaborator of.
alter table organization_members add column if not exists all_projects boolean not null default true;
alter table organization_members add column if not exists project_role text not null default 'commenter';
alter table organization_members add column if not exists areas text[] not null default '{research,tickets}';
alter table organization_members drop constraint if exists organization_members_project_role_check;
alter table organization_members add constraint organization_members_project_role_check check (project_role in ('viewer','commenter','editor'));
alter table organization_members drop constraint if exists organization_members_areas_check;
alter table organization_members add constraint organization_members_areas_check check (areas <@ array['research','tickets'] and cardinality(areas) > 0);

-- An invitation carries the same choices, applied when the account is created.
alter table invites add column if not exists org_all_projects boolean not null default true;
alter table invites add column if not exists org_project_role text not null default 'commenter' check (org_project_role in ('viewer','commenter','editor'));
alter table invites add column if not exists org_areas text[] not null default '{research,tickets}' check (org_areas <@ array['research','tickets'] and cardinality(org_areas) > 0);
alter table invites add column if not exists org_project_ids uuid[] not null default '{}';
