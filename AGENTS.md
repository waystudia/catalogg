# Navigation invariant

For all WayYaam roles, Back restores the exact previous UI entry (A → B → C → B → A), including tab, filter, selection and scroll. See `docs/navigation/back-navigation.md` for the architecture and test matrix.

- Use `useExactBack` for routed Back and `useBackAction` for reusable local controls, with a safe direct-entry fallback.
- Use `useHistoryViewState` for local screens, tabs and overlays that are navigation steps. Batch related setters into one transition.
- Use `useEntrySnapshotState` for filters, search and anchored-category observers. Scrolling/typing must not create history entries.
- Use `useViewNavigate` when local UI changes and a route/query change happen in the same action.
- Preserve role, verified account and establishment isolation. Restored UI state never grants access; retain authorization gates around restored panels.
- Never introduce blind `navigate(-1)` outside the central journal, use history length as proof of app provenance, or replace an ordinary forward transition with a fixed parent.
- Back does not undo submitted business operations. Preserve payment, QR, dispatch and authorization gates. Pagination and explicitly named destinations keep their own semantics.
- Exercise the actual visible control and browser Back/Forward at 319px, nested paths, delayed rendering, refresh, direct entry and unavailable storage. Run the existing release checks; do not claim every role is fixed from a client-only test.
