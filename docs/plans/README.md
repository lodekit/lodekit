# Plans

Implementation plans are branch-only working documents. While a slice is in flight
they live here as `YYYY-MM-DD-<slug>.md` — ordered, self-contained tasks with
acceptance criteria, a header line naming the spec they implement — committed and
pushed so they are reviewable on the draft PR. A spec may be implemented as several
plans, executed in order.

Plans are deleted in the branch's final commit and never land on master. The PR
body's Notes section links each plan's final version (GitHub keeps PR commits
reachable after the branch is deleted — link the deletion commit's parent so the
file resolves).

This README is the directory's only permanent resident. The full flow lives in
AGENTS.md §Develop.
