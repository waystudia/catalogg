# Face ID / Passkey guidance

## Goal

Help a client understand why WayYaam asks for Face ID or a fingerprint, while keeping checkout reliable and password fallback available. The biometric check unlocks a Passkey stored by the operating system; WayYaam never receives biometric data.

## Scenarios

| Scenario | Trigger | Primary message | Primary action | Fallback |
| --- | --- | --- | --- | --- |
| First checkout | A client enters a password, successfully creates or restores an account, and the device supports Passkeys | Save this profile so future restaurant links open with the same name, phone, history, contests and promotions | `Включить Face ID и оформить` | `Не сейчас, оформить заказ` |
| Restaurant link in Safari | A mobile external browser has no client session | Open the existing profile instead of ordering as a new client | `Открыть мой профиль по Face ID` | Password login or the legacy one-time pairing code |
| Returning installed PWA | The installed PWA no longer has a client session | Continue in the familiar profile without entering the password again | `Продолжить через Face ID` | Regular password login |

On devices without Face ID the operating system may show Touch ID, an Android fingerprint, device PIN or another Passkey confirmation. Product copy uses `Face ID или отпечаток` where space allows.

## Behaviour

### First checkout

1. Validate checkout and current stock.
2. Create or restore the client account with the entered password.
3. Open the explanation dialog before creating the restaurant order.
4. Register the Passkey only after the client presses the primary button.
5. Continue checkout after successful registration or after an explicit `Не сейчас`.
6. If registration fails or is cancelled, keep the dialog open, explain that the order is safe, and offer the fallback action. Never create a duplicate order.

### Safari link

The panel must explain concrete benefits before asking for biometrics:

- the same name and phone are restored;
- order history remains in one profile;
- contest and promotion participation is not lost.

The panel is hidden inside the installed PWA, on desktop, after a session is restored, or after dismissal for the current browser tab.

### Returning PWA

Show a full explanation panel above the password form. Do not invoke biometrics automatically: Safari and installed PWAs require a clear user gesture and users must be able to choose password login.

## Visual system

The explanation is a working WayYaam interface, not an illustration. Every state uses semantic HTML,
real buttons and the same profile-status component: context, profile state, retained data and the next action.
The three-dimensional concept images are not part of the product.

Panels use the existing WayYaam violet palette, a 24 px radius, compact profile cards and no inner
scrolling. Screenshots for review must be captured from these running components at a 390 px viewport;
they are documentation artifacts and are never displayed inside the application.

| Working state | Local preview | Screenshot |
| --- | --- | --- |
| First checkout | `#/__passkey-preview/checkout` | `docs/screenshots/passkey/checkout-face-id.png` |
| Restaurant link in Safari | `#/__passkey-preview/safari` | `docs/screenshots/passkey/safari-face-id.png` |
| Returning installed PWA | `#/__passkey-preview/pwa` | `docs/screenshots/passkey/pwa-face-id.png` |

The preview routes exist only in the Vite development build and are omitted from production routing.

## Accessibility and security

- Dialog uses `role="dialog"`, `aria-modal="true"`, a labelled title and an initial close/fallback action.
- Loading states disable duplicate biometric requests.
- Error and success messages use live regions.
- Passwords, Passkey credentials and biometric data are never placed in URLs or transferred between Safari and the PWA.
- Order creation starts once per idempotency key and is not coupled to successful biometric enrollment.

## Acceptance

- At 390 px all content fits the page width and buttons are at least 46 px tall.
- Cancelling Face ID does not lose cart, checkout data or the ability to submit the order.
- A successful Safari Passkey login restores the client name and phone.
- A signed-out installed PWA offers Passkey first and keeps password login visible.
- Unsupported devices keep the existing password and pairing-code flows.
