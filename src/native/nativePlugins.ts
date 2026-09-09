/**
 * 安卓原生增强插件的前端对接层
 * 通过 Capacitor registerPlugin 调用原生实现的系统能力（分享/相册/通知/文件/更新/主题）
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

/** 是否运行在安卓原生环境（Capacitor） */
export const isNative = () => Capacitor.getPlatform() === 'android';

/* ============ 原生核心 ============ */
export interface NativeCorePlugin {
  getAppInfo(): Promise<{ name: string; versionName: string; versionCode: number; platform: string; isNative: boolean }>;
}
/* ============ 原生分享 ============ */
export interface NativeSharePlugin {
  shareText(options: { text: string; title?: string }): Promise<void>;
  shareFile(options: { filename: string; base64: string; mime?: string; title?: string }): Promise<void>;
}
/* ============ 原生相册 ============ */
export interface NativeGalleryPlugin {
  pickImage(): Promise<{ base64: string; mime: string; size: number }>;
}
/* ============ 原生通知 ============ */
export interface NativeNotificationPlugin {
  show(options: { title?: string; body?: string; id?: number }): Promise<{ id: number }>;
}
/* ============ 原生文件系统 ============ */
export interface NativeFileAccessPlugin {
  pickDirectory(): Promise<{ uri: string; name: string }>;
  writeFile(options: { dirUri: string; filename: string; base64: string }): Promise<{ uri: string }>;
  readFile(options: { dirUri: string; filename: string }): Promise<{ exists: boolean; base64: string }>;
  listFiles(options: { dirUri: string }): Promise<{ files: { name: string; mime: string; isDir: boolean; uri: string }[] }>;
}
/* ============ 原生更新 ============ */
export interface NativeUpdatePlugin {
  checkUpdate(options: { version: string; latestVersion: string }): Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion: string }>;
  downloadApk(options: { url: string; filename?: string }): Promise<{ downloadId: number; message: string }>;
}
/* ============ 原生主题 ============ */
export interface NativeThemePlugin {
  applyTheme(options: { color?: string; isDark?: boolean; immersive?: boolean }): Promise<{ applied: boolean; color: string }>;
  getDynamicColor(): Promise<{ supported: boolean; color: string }>;
}

/* 注册原生插件（仅在安卓原生环境可用，非原生走 Web 兜底） */
const NativeCore = registerPlugin<NativeCorePlugin>('NativeCore');
const NativeShare = registerPlugin<NativeSharePlugin>('NativeShare');
const NativeGallery = registerPlugin<NativeGalleryPlugin>('NativeGallery');
const NativeNotification = registerPlugin<NativeNotificationPlugin>('NativeNotification');
const NativeFileAccess = registerPlugin<NativeFileAccessPlugin>('NativeFileAccess');
const NativeUpdate = registerPlugin<NativeUpdatePlugin>('NativeUpdate');
const NativeTheme = registerPlugin<NativeThemePlugin>('NativeTheme');

export { NativeCore, NativeShare, NativeGallery, NativeNotification, NativeFileAccess, NativeUpdate, NativeTheme };

/**
 * 供页面调用的安全封装：非原生环境或调用失败时返回默认值，不抛错
 */
export async function nativeAppInfo() {
  try {
    if (!isNative()) return { name: '创作助手', versionName: 'web', versionCode: 0, platform: 'web', isNative: false };
    return await NativeCore.getAppInfo();
  } catch {
    return { name: '创作助手', versionName: 'unknown', versionCode: 0, platform: 'web', isNative: false };
  }
}
