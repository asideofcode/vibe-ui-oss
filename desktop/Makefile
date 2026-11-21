# Le Chonk desktop — branded as "Vibe UI OSS" (alongside stock Mistral Vibe)
# Usage (from this directory):
#   make run      # build UI + brand app + launch (foreground — keep this terminal open)
#   make start    # launch only (skip rebuild)
#   make stop     # quit Vibe UI OSS
#   make helper   # rebuild computer-use window-control into the app bundle

ROOT := $(abspath .)
CLI  := $(abspath ../cli)
APP_NAME := Vibe UI OSS
APP  := $(ROOT)/.runtime/$(APP_NAME).app
BIN  := $(APP)/Contents/MacOS/Electron
HELPER_SRC := $(CLI)/.native-build/window-control
HELPER_DST := $(APP)/Contents/MacOS/window-control
CDP  ?= 9333

.PHONY: run start stop ensure-app build-ui helper doctor

run: build-ui ensure-app helper
	@echo "Launching $(APP_NAME) (CDP $(CDP)). Leave this terminal open."
	@VIBE_UI_CDP_PORT=$(CDP) "$(BIN)" --remote-debugging-port=$(CDP) "$(ROOT)"

start: ensure-app
	@test -x "$(BIN)" || (echo "Missing $(BIN) — run: make run"; exit 1)
	@echo "Launching $(APP_NAME) (CDP $(CDP)). Leave this terminal open."
	@VIBE_UI_CDP_PORT=$(CDP) "$(BIN)" --remote-debugging-port=$(CDP) "$(ROOT)"

stop:
	@pkill -f 'Vibe UI OSS\.app/Contents/MacOS/Electron' 2>/dev/null || true
	@pkill -f 'vibe-app-server' 2>/dev/null || true
	@echo "Stopped."

build-ui:
	npm run build:ui

ensure-app:
	npm run ensure:app

helper:
	@mkdir -p "$(CLI)/.native-build"
	swiftc -parse-as-library -target "$$(uname -m)-apple-macosx14.0" \
		"$(CLI)/scripts/computer-use/Logic.swift" \
		"$(CLI)/scripts/computer-use/WindowControl.swift" \
		-o "$(HELPER_SRC)"
	@codesign --force --sign - --identifier local.lechonk.vibe-ui-oss.window-control "$(HELPER_SRC)" 2>/dev/null || true
	@mkdir -p "$(APP)/Contents/MacOS"
	@cp "$(HELPER_SRC)" "$(HELPER_DST)"
	@chmod +x "$(HELPER_DST)"
	@codesign --force --sign - --identifier local.lechonk.vibe-ui-oss.window-control "$(HELPER_DST)" 2>/dev/null || true
	@echo "Helper → $(HELPER_DST)"

doctor:
	@echo "BIN:    $(BIN)  $$(test -x "$(BIN)" && echo OK || echo MISSING)"
	@echo "HELPER: $(HELPER_DST)  $$(test -x "$(HELPER_DST)" && echo OK || echo MISSING)"
	@echo "UI:     $$(test -f "$(ROOT)/renderer/dist/index.html" && echo OK || echo MISSING)"
	@pgrep -lf 'Vibe UI OSS\.app/Contents/MacOS/Electron --remote-debugging' || echo "(not running)"
