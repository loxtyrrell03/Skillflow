# Skillflow Product Guide

Use this file as the product-level source of truth for work in this repo.

## Agent workflow

- After an agent completes its assigned task, it must create a git commit for its own changes before handing work back.

## What Skillflow is

Skillflow is a session-based planning and focus product. Its core job is to help a user turn one larger study, practice, or work block into a sequence of timed mini-goals, then execute that session with a live timer and visible progress.

Skillflow is not primarily a generic notes app, generic task manager, or long-term project planner. The center of the product is:

- building a focused session
- breaking it into ordered sections
- attaching the right links and notes to each section
- staying on track while the session is running

## Core product model

The main objects in the product are:

- `currentSession`: the outline currently being worked through
- `savedOutlines`: reusable session templates
- `savedFolders`: folders and subfolders for organizing saved outlines
- `calendarEvents`: scheduled outline sessions
- `widgetShelf`: reusable link/resource cards that can be dragged into sections
- `timerState`: current section, time left, running/paused state, and related progress state
- `prefs`: settings such as theme, focus default, widget shelf visibility, notifications, and sound

Each session or outline is made of ordered sections. Each section can have:

- a title
- a duration in minutes
- a description / notes field
- attached links / resources

## Main product surfaces

### 1. Web app

The web app is the primary Skillflow surface. It includes:

- `Overview`: product intro plus today's schedule widgets
- `Session`: the active working surface for a current session
- `Outlines`: the saved outline library and editing workspace
- `Calendar`: scheduling and time-based planning
- `How to use`: help surface
- `Pricing`: pricing / positioning surface

### 2. Focus Mode

Focus Mode is an in-app overlay designed for execution. It shows:

- the current section
- a large clock
- progress across the session
- next / previous / start controls
- section links
- section notes

It is a dedicated focus surface, not a separate app. Users can also choose to start in focus mode by default.

### 3. Progress Pop-out

Skillflow has a separate progress pop-out window built with Document Picture-in-Picture. This is an always-on-top companion window for keeping the session visible while working elsewhere.

The pop-out supports:

- current section title and timing
- live progress bar
- start / pause, next, previous, and reset controls
- scrubbing / jumping through progress
- loading a saved outline into the current session
- a visible section list

Important: this feature depends on browser support for `documentPictureInPicture`, so it is not universal.

### 4. Chrome side panel extension

Skillflow also has a Chrome/Chromium extension that opens in the browser side panel.

This extension is a companion surface, not the full product. Its job is to keep the session timer and outline available beside the page the user is currently on.

The extension supports:

- local mode using cached outlines and timer state
- sign-in for sync
- live mirroring of the current web session from Skillflow
- loading saved sessions locally when not mirrored
- start / pause / stop / next / previous controls
- click-to-jump progress scrubbing
- section list display

When signed in and live sync is active, the extension can mirror and push timer/progress changes back to the website.

## Implemented capabilities

### Session planning and execution

Skillflow can:

- create a current session manually
- split that session into ordered timed sections
- start, pause, resume, stop, and reset a session
- move to previous / next sections
- use a "ready for next section" state between sections
- show a live progress bar for the full session
- jump to a point in the session by clicking or scrubbing the progress bar
- jump directly to a section from the outline

### Links, notes, and context reduction

Skillflow can:

- attach notes / descriptions to each section
- attach links to each section
- open section links in a new tab
- keep reusable links in a widget shelf
- drag widget shelf items into sections
- optionally hide the widget shelf and use direct add-link flows instead

This is a major part of the product: the user should not need to hunt for resources while working.

### Saved outlines

Saved outlines are reusable session templates. Skillflow can:

- create outlines
- load an outline into the current session
- duplicate outlines
- delete outlines
- edit outline titles
- add, edit, reorder, and delete sections
- edit section durations, notes, and links
- reorder section links
- merge one outline into another by drag-and-drop, creating a new combined outline

### Folders and organization

Skillflow can organize saved outlines using:

- folders
- subfolders
- breadcrumbs
- drag-and-drop moves into folders
- drag-and-drop moves back through breadcrumbs
- quick saved-outline filtering on the Session page

### Calendar and scheduling

Skillflow includes a built-in calendar layer for scheduling outlines.

It supports:

- multiple calendars / categories with colors
- calendar visibility toggles
- month view
- week view
- mini calendar navigation
- timed events
- all-day events
- multi-day events
- optional event notes
- recurrence: daily, weekly, monthly, yearly, or custom interval rules
- drag-and-drop rescheduling
- week-view moving and resizing of timed events
- overlapping event layout in week view

Starting a scheduled event loads its linked outline into the current session and moves the user to the Session tab.

### AI scheduling

Skillflow includes AI-assisted outline generation.

Current flow:

- the user gives a brief
- the backend generates a structured schedule
- Skillflow maps that schedule into an outline
- the user reviews and edits the outline in a preview modal
- the user can save it as a normal outline
- the user can also revise the draft with another AI prompt

AI options currently include:

- model selection
- include descriptions
- include link suggestions
- include subsections
- max links per section

### Auth and cloud sync

The web app supports:

- Google sign-in
- email/password sign-in
- password reset

When signed in, Skillflow syncs product state through Firestore, including:

- current session
- saved outlines
- folders
- calendar events
- widget shelf
- timer state
- preferences

The extension can restore auth, subscribe to the same shared timer/session state, and stay in sync with the web app.

### Focus, alerts, and onboarding

Skillflow also has:

- browser notification support for section-complete alerts
- configurable audio alerts
- theme and accent customization
- a setting to start in focus mode by default
- an interactive product tour

## Important truth for future work

When making product decisions, think of Skillflow as:

- a focused session planner
- a reusable outline library
- a lightweight scheduling layer
- a multi-surface focus experience across web, focus overlay, pop-out, and extension

Do not reduce it to only a timer, and do not drift it into a generic project-management product.

## Current caveats and non-goals

- The product brand is `Skillflow`, but some implementation details still use legacy `chessstudyplanner` / `chess_planner_v2` naming. Treat that as legacy infrastructure unless doing an explicit migration.
- The pricing UI advertises Free and Pro tiers, but billing is not implemented in this repo.
- The pricing UI mentions file upload, but there is no real file-upload feature implemented in the current app code.
- AI usage is currently gated by sign-in in the UI. There is no visible subscription enforcement in this codebase.
- The extension is a companion focus surface, not a complete replacement for the main web app.
