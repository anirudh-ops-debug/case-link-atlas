# TraceLink Insight

Mini CASELINK Prompt (Optimized for Limited Credits)

Build CASELINK, an AI-powered investigative intelligence platform for authorized law enforcement that helps locate missing/vulnerable persons and discover hidden relationships between crime cases by correlating fragmented evidence into timelines, maps, and explainable AI insights.

This is strictly a hackathon prototype using 100% fictional/synthetic data only. No real surveillance, police databases, CCTV integrations, phone records, or external government systems.

CORE OBJECTIVE

Create a premium, production-quality investigative command center—not a generic dashboard.

The experience should instantly communicate:

Cases → Evidence → Timeline → Map → AI Correlation → Cross-Case Links → Human Verification

The application should feel mysterious, analytical, trustworthy, cinematic, and technologically advanced while remaining realistic enough to resemble professional investigative software.

VISUAL STYLE

Use a predominantly dark theme.

Primary colors:

Midnight Navy (#070B14)

Charcoal (#0C111C)

Cyan Accent (#22D3EE)

Amber (#F59E0B)

Red (#EF4444)

Green (#34D399)

Use subtle glow effects, glassmorphism, thin borders, compact typography, IBM Plex/Inter fonts, and slow forensic-grid background animations.

Avoid colorful consumer UI, hacker aesthetics, gaming HUDs, or excessive neon.

MAIN PAGES

Create:

Secure Login

Command Center Dashboard

Active Investigations

New Investigation Wizard

Investigation View

Evidence Management

Cross-Case Link Finder

Investigator Profile/System Settings

Everything should be fully connected.

LOGIN

Professional intelligence login screen.

Animated three-node TRACE logo.

Fields:

Investigator ID

Access Code

Button:

ENTER SECURE ENVIRONMENT

Footer:

SYNTHETIC DEMO DATA ONLY

DASHBOARD

Display:

Active Cases

Missing Persons

Potential Links

Evidence Count

Include:

Live investigation feed

Active case cards

Recent AI discoveries

Intelligence alerts

Clicking any case opens the Investigation View.

NEW INVESTIGATION

Create a guided multi-step wizard:

Subject

Incident

Evidence

Review

Fields include:

Name

Case Type

Priority

Date

Last Known Location

Notes

Evidence types:

CCTV

Witness

Phone

Photo

Transport

Location

Each upload animates:

PROCESSING → INDEXED → CORRELATED

INVESTIGATION VIEW

Three-column layout:

Left:
Interactive timeline

Center:
Dark tactical map

Right:
AI Intelligence Panel

Timeline and map must remain synchronized.

Selecting either updates the other.

MAP

Dark tactical style.

Show:

CCTV markers

Witness markers

Phone pings

Transport

Locations

Draw animated movement paths.

Display confidence values.

Hovering any route explains WHY the connection exists.

AI PANEL

Display:

Most probable direction

Confidence percentage

Supporting evidence

Confidence breakdown

AI explanation

Always explain WHY the AI reached each conclusion.

CROSS-CASE LINK FINDER

Interactive network graph.

Cases become nodes.

Shared evidence creates animated edges.

Selecting a connection opens:

Confidence

Shared attributes

AI explanation

Confirm

Reject

Needs More Evidence

EVIDENCE THREAD

Clicking any evidence item reveals all connected evidence across:

Timeline

Map

AI Panel

Network Graph

Evidence Drawer

Everything should illuminate together.

CASE DRAWER

Clicking any case or evidence opens a side drawer displaying:

Source

Timestamp

Location

Reliability

Related Evidence

AI Interpretation

MOCK DATA

Generate realistic fictional investigations around Chennai and nearby cities.

Create seeded data with enough overlap for meaningful cross-case detection.

Include:

Missing persons

Burglary

Theft

Assault

Vehicle information

Witnesses

Coordinates

Evidence IDs

Timestamps

INTELLIGENT MATCHING

Whenever investigators create or update cases, automatically correlate against every existing mock case.

Compare:

Names

Aliases

Phone numbers

Vehicles

Locations

Coordinates

Dates

Time ranges

Witnesses

CCTV

Weapons

Modus Operandi

Transport

Notes

Keywords

Timeline overlaps

Geographic proximity

Behavioral similarities

Generate explainable confidence scores.

Never report "No Match Found" when meaningful similarities exist.

Always explain why matches were suggested.

HUMAN VERIFICATION

AI is decision-support only.

Every recommendation requires:

Confirm

Reject

Needs More Evidence

Show investigation status updating after verification.

MICRO INTERACTIONS

Include:

Hover highlights

Count-up animations

Animated evidence processing

Timeline-map synchronization

Network edge drawing

Pulsing intelligence nodes

Smooth drawer animations

Soft loading transitions

Animations should feel analytical, never flashy.

RESPONSIVENESS

Desktop-first.

On smaller screens:

Sidebar collapses

Timeline becomes vertical

AI panel becomes bottom drawer

Map remains primary

NON-NEGOTIABLE EXECUTION REQUIREMENTS

This application must be completely functional.

No placeholders.

No broken buttons.

No unfinished pages.

No fake navigation.

No missing interactions.

No dummy data flow.

Every button, filter, modal, upload, graph, search, map interaction, timeline event, AI explanation, and animation must function correctly.

When new evidence is added, all related dashboard metrics, maps, timelines, AI insights, graphs, searches, and linked cases must update automatically.

The application must gracefully handle duplicate entries, invalid inputs, edits, deletions, refreshes, and larger mock datasets without crashing.

Provide meaningful loading states with skeletons and processing animations instead of blank screens.

Assume this application will be demonstrated tomorrow to senior police officials. The entire experience must appear complete, polished, reliable, and production-ready despite using fictional data.

The final impression should be that CASELINK is a modern investigative intelligence platform capable of connecting fragmented evidence into clear, explainable insights while keeping humans responsible for all final decisions.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/80d795c5-2111-4459-8a64-f36e9b8cf7c6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
