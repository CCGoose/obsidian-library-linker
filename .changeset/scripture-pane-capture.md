---
'jw-library-linker': patch
---

Make Cmd/Ctrl+click reach the scripture pane: Obsidian opened the link from its own listeners first, so the handlers now run in the capture phase and also cancel the mousedown that starts the navigation.
