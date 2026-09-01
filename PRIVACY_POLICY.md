# Privacy Policy for Incasters

**Effective Date:** September 1, 2026  
**Last Updated:** September 1, 2026  
**Application:** Incasters  
**Package / App ID:** `com.incasters.game`  
**Developer:** Björn Brorsson  
**Contact Email:** [bjorn.fristrom@gmail.com](mailto:bjorn.fristrom@gmail.com)  
**Repository:** [https://github.com/BjornBrorsson/Incasters](https://github.com/BjornBrorsson/Incasters)  

---

## 1. Introduction

This Privacy Policy describes how **Incasters** ("we", "our", or "the game") handles information across all supported platforms, including Web browsers, Android mobile devices, and Windows desktop distributions.

We strongly value your privacy. **Incasters is designed from the ground up not to collect, store, transmit, or sell any personal information.**

---

## 2. Information We Do NOT Collect

Incasters does **not** collect, store, or share any personally identifiable information (PII). Specifically:
- **No Account Registration:** You do not need to create an account, log in, or provide an email, username, or password to play the game.
- **No Personal Identifiers:** We do not collect names, phone numbers, email addresses, physical addresses, or financial data.
- **No Location Tracking:** We do not access, track, or record GPS or precise geographic location data.
- **No Device Identifiers or Telemetry:** We do not read hardware serial numbers, IMEI, advertising IDs (e.g. Google Advertising ID / GAID), or device fingerprints.
- **No Biometrics or Media:** We do not request or access your device's camera, microphone, photos, or media files.

---

## 3. On-Device Local Data Storage

All game progress and configuration settings are stored **exclusively on your local device** using standard browser/client storage (`localStorage` on Web and Desktop, or local app data storage on Android):

- **Player Progression:** Current level, experience points (XP), unlocked cosmetic items (robes, hats, facegear, weapons), and challenge completion status.
- **Game Preferences:** Master volume, music volume, SFX volume, sound mute state, bot difficulty setting, and last selected game mode/arena.
- **Character Customization:** Saved wizard cosmetic configuration (robe color, eye color, spell color, equipped gear).

**This data never leaves your device.** It is not transmitted to any remote cloud database, analytics service, or external server.

---

## 4. Local Area Network (LAN) Multiplayer

Incasters includes an optional Local Area Network (LAN) multiplayer feature:
- Multiplayer connections run over a local WebSocket server (`lan-server`) hosted by one of the players on the same local network (Wi-Fi or Ethernet).
- Transmitted data consists solely of real-time in-game inputs, coordinates, spell states, and session-only player display names chosen by players for that match.
- **All multiplayer communication stays strictly within your local network.** No game packets or player identifiers are routed through external cloud servers, matchmaking relays, or public third-party services.

---

## 5. Device Permissions (Android)

On Android devices, Incasters requests only the minimum necessary permission:
- `android.permission.INTERNET`: Used exclusively to allow the internal web view to load local game assets and to enable local network socket connections for the LAN multiplayer feature.

No sensitive permissions (such as `ACCESS_FINE_LOCATION`, `READ_CONTACTS`, `CAMERA`, `RECORD_AUDIO`, or `READ_EXTERNAL_STORAGE`) are requested or used.

---

## 6. Third-Party Services and Analytics

- **No Third-Party Analytics:** We do not integrate tracking services such as Google Analytics, Firebase Analytics, Unity Analytics, Mixpanel, or GameAnalytics.
- **No Advertising Networks:** Incasters contains zero advertisements. We do not integrate AdMob, Unity Ads, AppLovin, or any other advertising SDKs.
- **Web Fonts:** The web version loads open-source fonts (`Inter`, `Outfit`, `Cinzel`) via Google Fonts. These requests are governed by standard HTTP asset delivery and do not track individual gameplay activity.

---

## 7. Children's Privacy (COPPA & GDPR Compliance)

Incasters is designed for all audiences and fully complies with the **Children’s Online Privacy Protection Act (COPPA)** and the **General Data Protection Regulation (GDPR)**:
- We do not knowingly collect, request, or solicit personal information from children under 13 (or under 16 in the European Union).
- Because the game collects no personal data from any player, children may safely play without risk of personal data harvesting or profiling.

---

## 8. Data Retention and Deletion

Because all game data resides strictly on your local device, you maintain complete control over it at all times:
- **Web:** Clear your browser's site data or cookies/storage for the site hosting Incasters.
- **Android:** Open Android **Settings → Apps → Incasters → Storage & Cache → Clear Storage**.
- **Windows:** Delete the local app storage directory or uninstall the application.
- **Uninstalling:** Completely removing the application deletes all locally stored preferences and save data.

---

## 9. Open Source Transparency

Incasters is open-source software distributed under the [MIT License](https://opensource.org/licenses/MIT). You can independently inspect the full source code, build scripts, and dependencies on GitHub:
👉 [https://github.com/BjornBrorsson/Incasters](https://github.com/BjornBrorsson/Incasters)

---

## 10. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect game updates or legal requirements. Any modifications will be posted directly to the GitHub repository with an updated "Last Updated" date. Continued use of Incasters after changes are posted constitutes acceptance of the revised policy.

---

## 11. Contact Us

If you have any questions, suggestions, or concerns regarding this Privacy Policy or the security of Incasters, please contact:

- **Developer:** Björn Brorsson
- **Email:** [bjorn.fristrom@gmail.com](mailto:bjorn.fristrom@gmail.com)
- **GitHub Issues:** [https://github.com/BjornBrorsson/Incasters/issues](https://github.com/BjornBrorsson/Incasters/issues)
