# Vizuil

Publish completed Vizuil updates to https://vizuil.kinneyelliot289.chatgpt.site/ and verify the live deployment before reporting the update as ready. Make scene and visualizer changes in `Web`, run `node Prepare-Site.mjs` to refresh `Site/dist`, and deploy to the existing Site identified by `Site/.openai/hosting.json`.

Build the Windows portable app when a Windows release is requested. Use `Publish.ps1` to build and verify `dist\portable\Vizuil.exe`. If the portable copy is running, the script installs the staged executable with a same-volume rename and rollback while the current session continues.
