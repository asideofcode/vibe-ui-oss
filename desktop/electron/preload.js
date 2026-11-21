"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("leChonk", {
  getBootstrap: () => ipcRenderer.invoke("app:getBootstrap"),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  setWorkspace: (cwd) => ipcRenderer.invoke("workspace:set", cwd),
  listWorkspace: (cwd, depth) =>
    ipcRenderer.invoke("workspace:list", cwd, depth),
  readWorkspaceFile: (filePath) =>
    ipcRenderer.invoke("workspace:readFile", filePath),
  readAttachmentImage: (uriOrPath) =>
    ipcRenderer.invoke("attachments:readImage", uriOrPath),
  readLocalImage: (uriOrPath) =>
    ipcRenderer.invoke("local:readImage", uriOrPath),
  openLocalPath: (uriOrPath) =>
    ipcRenderer.invoke("local:openPath", uriOrPath),
  connect: () => ipcRenderer.invoke("server:connect"),
  listSessions: (cwd) => ipcRenderer.invoke("session:list", cwd),
  startSession: () => ipcRenderer.invoke("session:start"),
  resumeSession: (sessionId) =>
    ipcRenderer.invoke("session:resume", sessionId),
  continueSession: () => ipcRenderer.invoke("session:continue"),
  readSession: (sessionId) => ipcRenderer.invoke("session:read", sessionId),
  readIdentity: () => ipcRenderer.invoke("identity:read"),
  readConfig: () => ipcRenderer.invoke("config:read"),
  writeModelConfig: (payload) =>
    ipcRenderer.invoke("config:modelWrite", payload),
  startTurn: (text) => ipcRenderer.invoke("turn:start", text),
  interruptTurn: (payload) => ipcRenderer.invoke("turn:interrupt", payload),
  answerCallback: (payload) => ipcRenderer.invoke("callback:answer", payload),
  stopSession: () => ipcRenderer.invoke("session:stop"),
  createTerminal: (payload) => ipcRenderer.invoke("term:create", payload),
  writeTerminal: (id, data) =>
    ipcRenderer.invoke("term:write", { id, data }),
  resizeTerminal: (id, cols, rows) =>
    ipcRenderer.invoke("term:resize", { id, cols, rows }),
  disposeTerminal: (id) => ipcRenderer.invoke("term:dispose", id),
  on: (channel, handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
