# Beta Signup Enrichment

## Problem

Beta signups currently capture only an email address. This provides no context for customer discovery, interview prioritization, or understanding who is signing up and why. Three beta registrants are in the pipeline with no demographic information beyond their email.

## Solution

Add four fields to the beta signup form. Keep it short enough that it doesn't kill conversion.

## Fields

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| Email | email | Yes | Already exists |
| Company or Project | text (free) | Yes | Identify the organization or product |
| Role | select | Yes | Segment by persona (founder, engineer, platform lead, other) |
| What are you building? | text (free, one line) | No | Understand use case and pain point |
| Agents in production? | select | No | Prioritize outreach (0 / 1-5 / 5+) |

## Role Options

- Founder / Co-founder
- Engineering Lead / Manager
- Platform / Infrastructure Engineer
- Individual Developer
- Other

## Agents in Production Options

- None yet (exploring)
- 1-5
- 5+

## Implementation

- Add fields to the existing signup form on arachne-ai.com
- Store in the same datastore as current registrations
- Backfill: send a short follow-up to existing registrants asking them to complete their profile (frame it as "help us prioritize your beta access")

## Design Constraints

- The form should remain completable in under 30 seconds
- Required fields: email, company, role. Optional: what are you building, agents in production
- No multi-page forms. Single view, single submit.

## Backfill Email (Draft)

Subject: Quick question about your Arachne beta signup

Body:

Hey [name or "there"],

You signed up for the Arachne beta — thank you. We're rolling out access and want to make sure we prioritize the right use cases.

Could you take 15 seconds to tell us a bit more?

[Link to short form: company, role, what you're building, agents in production]

That's it. No demo, no sales call, just context so we can get you the right access.

— Michael
