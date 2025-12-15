import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, Search, Phone, Menu, Plus, Camera, Image as ImageIcon, Mic, Smile, Send, Trash2,
  Download, User, Package, Coffee, Calendar, Loader2, X, Smartphone, CheckCircle2
} from 'lucide-react';

import { toCanvas } from 'html-to-image';
import JSZip from 'jszip';

// --- Components defined OUTSIDE the main component ---

// 1. 廣告版位元件
const AdSpace = ({ label, className }) => (
  <div className={`bg-gray-200 border-2 border-dashed border-gray-400 rounded-lg flex flex-col items-center justify-center text-gray-500 p-4 transition-all duration-300 ${className}`}>
    <span className="text-xs font-bold uppercase tracking-wider mb-1">廣告版位 ({label})</span>
    <span className="text-[10px] text-center">Google AdSense / 其他廣告聯播網</span>
  </div>
);

// 2. 手機狀態列元件
const PhoneStatusBar = ({ currentTime }) => (
  <div className="flex justify-between items-center px-6 py-2 text-black text-sm font-semibold select-none">
    <div className="pl-2 font-sans">{currentTime}</div>
    <div className="flex items-center gap-1 pr-2">
      <div className="h-3 w-3 bg-black rounded-full opacity-20"></div>
      <div className="h-3 w-3 bg-black rounded-full opacity-20"></div>
      <div className="h-3 w-3 bg-black rounded-full opacity-100"></div>
      <span className="ml-1 font-sans">5G</span>
      <div className="flex items-center border border-black/40 rounded px-0.5 ml-1 h-3">
        <div className="w-4 bg-black h-2"></div>
      </div>
    </div>
  </div>
);

const LineChatGenerator = () => {
  // --- State & Refs ---

  // Helper to get current time string HH:MM
  const getCurrentTime = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getFormattedDate = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const days = ["日", "一", "二", "三", "四", "五", "六"];
    const dayOfWeek = days[date.getDay()];
    return `${month}/${day} (${dayOfWeek})`;
  };

  const phoneRef = useRef(null);
  const chatAreaRef = useRef(null);
  const chatContentRef = useRef(null);
  const bottomRef = useRef(null);

  const isInitialMount = useRef(true);
  const prevMessagesLen = useRef(0);

  const [chatName, setChatName] = useState("小胡");
  const [chatDate, setChatDate] = useState(getTodayDateString());
  const [currentTime, setCurrentTime] = useState(getCurrentTime());
  const [autoSyncSystemTime, setAutoSyncSystemTime] = useState(true);
  const [aspectRatio, setAspectRatio] = useState("19:9");
  const [isMobile, setIsMobile] = useState(false);

  const [user1Avatar, setUser1Avatar] = useState(null);

  const [activeUser, setActiveUser] = useState(2);
  const [inputText, setInputText] = useState("");
  const [inputTime, setInputTime] = useState(getCurrentTime());
  const [autoSyncTime, setAutoSyncTime] = useState(true);
  const [isRead, setIsRead] = useState(true);
  const [pendingImage, setPendingImage] = useState(null);

  const [autoScreenshot, setAutoScreenshot] = useState(false);
  const [screenshots, setScreenshots] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const nowStr = getCurrentTime();
      if (autoSyncSystemTime) {
        setCurrentTime(nowStr);
        if (autoSyncTime) setInputTime(nowStr);
      } else {
        if (autoSyncTime) setInputTime(currentTime);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [autoSyncSystemTime, autoSyncTime, currentTime]);

  const [messages, setMessages] = useState([]);

  const getPhoneHeight = () => {
    switch (aspectRatio) {
      case "16:9": return 667;
      case "19.5:9": return 844;
      case "21:9": return 875;
      case "19:9":
      default: return 812;
    }
  };

  // 等待聊天內容中的圖片載入完成
  const waitForChatImages = async () => {
    const wrapper = chatContentRef.current;
    if (!wrapper) return;

    const imgs = wrapper.querySelectorAll("img");
    const tasks = Array.from(imgs).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.onload = done;
        img.onerror = done;
        setTimeout(done, 3000);
      });
    });

    await Promise.all(tasks);
  };

  // 等字型 + 等 repaint
  const waitForStableFrame = async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  // 等待滾動真正到位
  const waitForScrollSettled = async (el, targetScrollTop, { maxFrames = 30, tolerance = 1 } = {}) => {
    if (!el) return;

    let last = -1;
    let stableCount = 0;

    for (let i = 0; i < maxFrames; i++) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const cur = el.scrollTop;
      const reached = Math.abs(cur - targetScrollTop) <= tolerance;

      if (reached) return;

      if (Math.abs(cur - last) <= tolerance) stableCount += 1;
      else stableCount = 0;

      if (stableCount >= 2) return;

      last = cur;
    }
  };

  // 永遠用「預覽當下的 scrollTop」重建 clone 視窗（WYSIWYG）
  const captureScreen = async () => {
    if (!phoneRef.current || isCapturing) return;
    setIsCapturing(true);

    const runtimeChatArea = chatAreaRef.current;
    const runtimeChatContent = chatContentRef.current;

    // 取得當前元件的寬高，確保截圖尺寸一致
    const node = phoneRef.current;
    const nodeWidth = node.offsetWidth;
    const nodeHeight = node.offsetHeight;

    // 測量所有氣泡在「真實預覽畫面」中的尺寸
    const bubbleMeasurements = [];
    if (runtimeChatContent) {
        const bubbles = runtimeChatContent.querySelectorAll('.message-bubble');
        bubbles.forEach(b => {
            const rect = b.getBoundingClientRect();
            bubbleMeasurements.push({
                width: rect.width,
                height: rect.height
            });
        });
    }

    // 備份 inline style
    const prev = runtimeChatArea && runtimeChatContent ? {
      areaOverflow: runtimeChatArea.style.overflow,
      areaHeight: runtimeChatArea.style.height,
      areaScrollTop: runtimeChatArea.scrollTop,
      contentTransform: runtimeChatContent.style.transform,
      contentWillChange: runtimeChatContent.style.willChange,
    } : null;

    try {
      if (!toCanvas) {
        console.error("html-to-image library not loaded yet.");
        // 在本地開發環境使用 import 時，這行請刪除
        setIsCapturing(false);
        return;
      }

      // 1) 等聊天圖片載入完成
      await waitForChatImages();

      if (!runtimeChatArea || !runtimeChatContent) return;

      // 2) 捲到底 (自動截圖時適用)
      bottomRef.current?.scrollIntoView({ block: 'end' });

      // 3) 等滾動真的到位
      const targetScrollTop = Math.max(0, runtimeChatArea.scrollHeight - runtimeChatArea.clientHeight);
      await waitForScrollSettled(runtimeChatArea, targetScrollTop);

      // 4) 讀取「預覽當下」的 scrollTop
      const runtimeScrollTop = runtimeChatArea.scrollTop;
      const runtimeViewportHeight = runtimeChatArea.clientHeight;

      // 5) 暴力：把 scroll 狀態 bake 進真實 DOM
      runtimeChatArea.style.overflow = 'hidden';
      runtimeChatArea.style.height = `${runtimeViewportHeight}px`;
      runtimeChatArea.scrollTop = 0;

      runtimeChatContent.style.transform = `translate3d(0, -${runtimeScrollTop}px, 0)`;
      runtimeChatContent.style.willChange = 'transform';

      // 6) 等字型 + 等 repaint
      await waitForStableFrame();

      // 7) 執行截圖
      const canvas = await toCanvas(phoneRef.current, {
        width: nodeWidth,
        height: nodeHeight,
        pixelRatio: 2,
        cacheBust: true,
        skipAutoScale: true,
        style: { margin: 0 },
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement("style");
          // 補上 padding-left/right 確保氣泡寬度計算正確，防止文字異常換行
          style.innerHTML = `
            [data-screenshot-target="true"] * {
              -webkit-font-smoothing: antialiased;
              text-rendering: geometricPrecision;
              box-sizing: border-box;
            }
            [data-screenshot-target="true"] .message-bubble {
               line-height: 1.5 !important; 
               padding-top: 8px !important;
               padding-bottom: 8px !important;
               padding-left: 12px !important; /* Tailwind px-3 */
               padding-right: 12px !important; /* Tailwind px-3 */
            }
            [data-screenshot-target="true"] .badge-99 {
               padding-top: 2px !important;
            }
            [data-screenshot-target="true"] .date-tag {
               padding-top: 3px !important;
            }
          `;
          clonedDoc.head.appendChild(style);

          // 將測量到的寬高強制應用到 Clone 的氣泡上
          const clonedBubbles = clonedDoc.querySelectorAll('.message-bubble');
          clonedBubbles.forEach((b, i) => {
              const m = bubbleMeasurements[i];
              if (m) {
                  // width + 1px 是緩衝區，height 鎖定避免多出一行空白
                  b.style.cssText += `width: ${m.width + 1}px !important; height: ${m.height}px !important; min-width: ${m.width}px !important; max-width: none !important; flex: none !important;`;
              }
          });
        }  
      });

      // 8) clip
      const clipped = document.createElement('canvas');
      clipped.width = canvas.width;
      clipped.height = canvas.height;
      const ctx = clipped.getContext('2d');
      ctx.drawImage(canvas, 0, 0);

      const dataUrl = clipped.toDataURL('image/png');
      setScreenshots((prevShots) => [...prevShots, { id: Date.now(), src: dataUrl }]);
    } catch (error) {
      console.error('Screenshot failed:', error);
    } finally {
      // 還原 DOM
      try {
        if (prev && runtimeChatArea && runtimeChatContent) {
          runtimeChatArea.style.overflow = prev.areaOverflow;
          runtimeChatArea.style.height = prev.areaHeight;
          runtimeChatArea.scrollTop = prev.areaScrollTop;
          runtimeChatContent.style.transform = prev.contentTransform;
          runtimeChatContent.style.willChange = prev.contentWillChange;
        }
      } catch (e) {
        // ignore restore errors
      }
      setIsCapturing(false);
    }
  };

  // 自動截圖
  useEffect(() => {
    const isAdding = messages.length > prevMessagesLen.current;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevMessagesLen.current = messages.length;
      return;
    }

    if (!isAdding) {
      prevMessagesLen.current = messages.length;
      return;
    }

    const run = async () => {
      try {
        await waitForChatImages();
        bottomRef.current?.scrollIntoView({ block: 'end' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        // 在本地開發環境使用 import 時，不需要檢查 window.htmlToImage
        if (autoScreenshot && !isCapturing) {
          await captureScreen();
        }
      } catch (e) {
        console.error('Auto screenshot flow failed:', e);
      }
    };

    run();
    prevMessagesLen.current = messages.length;
  }, [messages, autoScreenshot, isCapturing]);

  // --- Other Handlers ---
  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUser1Avatar(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleImageMessageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPendingImage(reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value = null;
  };

  const handleSendImage = () => {
    if (pendingImage) {
      addMessage('image', pendingImage);
      setPendingImage(null);
    }
  };

  const addMessage = (type, content) => {
    if (!content && type === 'text') return;
    const newMessage = {
      id: Date.now(),
      sender: activeUser,
      type,
      content,
      time: inputTime,
      read: activeUser === 2 ? isRead : false,
    };
    setMessages((prev) => [...prev, newMessage]);
    if (type === 'text') setInputText("");
  };

  const deleteMessage = (id) => setMessages(messages.filter(msg => msg.id !== id));
  const deleteScreenshot = (id) => setScreenshots(screenshots.filter(s => s.id !== id));

  const downloadScreenshot = (src, fileName) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `${fileName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllScreenshots = async () => {
    if (screenshots.length === 0) return;
    
    // 在本地開發環境使用 import 時，這行檢查請刪除
    if (!JSZip) return;

    // 在本地開發環境使用 import 時，請改用 new JSZip()
    const zip = new JSZip();
    screenshots.forEach((shot, index) => {
      const base64Data = shot.src.split(',')[1];
      zip.file(`screenshot-${index + 1}.png`, base64Data, { base64: true });
    });
    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `line-chat-history-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to zip files", err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans flex flex-col justify-start items-center">
      {/* Header */}
      <div className="w-full max-w-7xl mx-auto mb-6 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <span className="bg-green-500 text-white p-2 rounded-lg"><Smartphone size={28} /></span>
              Line 對話產生器
            </h1>
            <div className="text-gray-600 text-sm leading-relaxed space-y-2">
  <p>
    <strong>Line 對話產生器</strong>是一款免費的線上工具，讓你快速建立擬真的 LINE 聊天畫面。
    你可以自訂聊天室名稱、日期、時間、對話內容、圖片與已讀狀態，並即時預覽、一鍵截圖下載。
    適合用於梗圖製作以及Line貼圖情境展示，無需安裝、開啟即用。
  </p>
</div>
          </div>
          <div className="flex-shrink-0">
            <a
              href="https://portaly.cc/xiaohu/support?utm_source=threads&utm_medium=social&utm_content=link_in_bio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-6 py-3 rounded-full font-bold shadow-md transition-all hover:scale-105 hover:shadow-lg whitespace-nowrap"
            >
              <Coffee size={20} strokeWidth={2.5} /> 贊助小胡一杯咖啡
            </a>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row gap-6 justify-center items-start">
        {/* Control Panel */}
        <div className="flex flex-col gap-4 w-full md:flex-1 order-1 transition-all duration-300 ease-in-out" style={{ height: isMobile ? 'auto' : `${getPhoneHeight()}px` }}>
          <div className="bg-white p-6 rounded-xl shadow-lg flex flex-col gap-6 scrollbar-thin scrollbar-thumb-gray-300 transition-all duration-300 ease-in-out flex-1 min-h-0" style={{ overflowY: isMobile ? 'visible' : 'auto' }}>
            <section className="space-y-3">
              <h2 className="font-semibold text-gray-600 flex items-center gap-2"><User size={18} /> 基本設定</h2>
              <div>
                <label className="text-xs text-gray-500 block mb-1">聊天室名稱</label>
                <input type="text" value={chatName} onChange={(e) => setChatName(e.target.value)} className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">聊天室日期</label>
                <div className="relative">
                  <input type="date" value={chatDate} onChange={(e) => setChatDate(e.target.value)} className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-gray-500">現在時間 (手機上方)</label>
                  <label className="flex items-center gap-1 cursor-pointer select-none" title="時間會自動隨系統更新">
                    <input
                      type="checkbox"
                      checked={autoSyncSystemTime}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAutoSyncSystemTime(checked);
                        if (checked) {
                          const nowStr = getCurrentTime();
                          setCurrentTime(nowStr);
                          if (autoSyncTime) setInputTime(nowStr);
                        }
                      }}
                      className="w-3 h-3 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="text-[10px] text-gray-500">使用現在時間</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={currentTime}
                  onChange={(e) => { setCurrentTime(e.target.value); setAutoSyncSystemTime(false); }}
                  disabled={autoSyncSystemTime}
                  className={`w-full border rounded px-3 py-2 text-sm ${autoSyncSystemTime ? 'bg-gray-50 text-gray-400' : ''}`}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">螢幕比例</label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  {['16:9', '19:9', '19.5:9', '21:9'].map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`flex-1 py-1.5 text-xs rounded-md transition-all font-medium whitespace-nowrap ${aspectRatio === ratio ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-dashed mt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={autoScreenshot} onChange={(e) => setAutoScreenshot(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700 font-medium">啟用「自動截圖」功能</span>
                </label>
                <p className="text-[10px] text-gray-400 pl-6 pt-1">發送訊息後，自動截取右側手機畫面至下方相簿</p>
              </div>
            </section>

            <section className="space-y-3 border-t pt-4">
              <h2 className="font-semibold text-gray-600">角色 1 (對方) 設定</h2>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 bg-gray-200 rounded-full overflow-hidden shrink-0 border border-gray-300">
                  {user1Avatar ? <img src={user1Avatar} alt="User 1" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-gray-400"><User /></div>}
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">上傳頭貼</label>
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="text-xs w-full text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-4">
              <h2 className="font-semibold text-gray-600">新增訊息</h2>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setActiveUser(1)} className={`flex-1 py-2 text-sm rounded-md transition-all font-medium ${activeUser === 1 ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>對方 (左)</button>
                <button onClick={() => setActiveUser(2)} className={`flex-1 py-2 text-sm rounded-md transition-all font-medium ${activeUser === 2 ? 'bg-[#EBE4D8] shadow text-gray-800' : 'text-gray-500'}`}>我 (右)</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-500">訊息時間</label>
                    <label className="flex items-center gap-1 cursor-pointer select-none" title="自動隨手機時間更新">
                      <input type="checkbox" checked={autoSyncTime} onChange={(e) => setAutoSyncTime(e.target.checked)} className="w-3 h-3 text-green-600 rounded focus:ring-green-500" />
                      <span className="text-[10px] text-gray-500">同步手機時間</span>
                    </label>
                  </div>
                  <input type="text" value={inputTime} onChange={(e) => { setInputTime(e.target.value); setAutoSyncTime(false); }} disabled={autoSyncTime} className={`w-full border rounded px-2 py-1.5 text-sm ${autoSyncTime ? 'bg-gray-50 text-gray-400' : ''}`} />
                </div>
                <div className="flex flex-col pt-1 pl-2 justify-center">
                  {activeUser === 2 && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={isRead} onChange={(e) => setIsRead(e.target.checked)} className="rounded text-green-600 focus:ring-green-500" />
                      <span className="text-sm text-gray-700">顯示「已讀」</span>
                    </label>
                  )}
                </div>
              </div>
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="輸入對話內容..." className="w-full border rounded-lg px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-green-500"></textarea>

              {pendingImage && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-2 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-1 px-1">
                    <span className="text-xs font-semibold text-green-800">準備發送的圖片</span>
                    <button onClick={() => setPendingImage(null)} className="text-gray-400 hover:text-red-500 transition-colors" title="取消圖片"><X size={16} /></button>
                  </div>
                  <div className="bg-white/50 rounded flex justify-center py-2 mb-2 border border-green-100"><img src={pendingImage} alt="Preview" className="h-32 object-contain" /></div>
                  <button onClick={handleSendImage} className="w-full bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"><Send size={14} /> 發送圖片</button>
                </div>
              )}

              <div className="flex gap-2">
                <label className={`cursor-pointer bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center justify-center transition-colors ${pendingImage ? 'opacity-50' : ''}`} title="上傳圖片">
                  <ImageIcon size={18} />
                  <input type="file" accept="image/*" onChange={handleImageMessageUpload} className="hidden" />
                </label>
                <button onClick={() => addMessage('text', inputText)} disabled={!inputText.trim()} className="flex-1 bg-gray-800 hover:bg-gray-900 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"><Send size={16} /> 發送文字</button>
              </div>
            </section>

            {screenshots.length > 0 && (
              <section className="space-y-3 border-t pt-4">
                <h2 className="font-semibold text-gray-600 flex justify-between items-center">
                  <span>暫存截圖 ({screenshots.length})</span>
                  <div className="flex gap-3">
                    <button onClick={downloadAllScreenshots} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline" title="打包下載所有截圖"><Package size={14} /> 打包下載</button>
                    <button onClick={() => setScreenshots([])} className="text-xs text-red-500 hover:underline">清空全部</button>
                  </div>
                </h2>
                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto content-start">
                  {screenshots.map((shot, index) => (
                    <div key={shot.id} className="relative group border rounded-md overflow-hidden bg-gray-50 cursor-pointer shadow-sm hover:shadow-md transition-all" onClick={() => setPreviewImage(shot.src)}>
                      <img src={shot.src} alt={`screenshot-${index + 1}`} className="w-full h-auto object-contain" />
                      <div className="absolute bottom-0 left-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-tr pointer-events-none">{index + 1}</div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); deleteScreenshot(shot.id); }} className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-sm transition-transform hover:scale-110" title="刪除"><Trash2 size={10} /></button>
                        <button onClick={(e) => { e.stopPropagation(); downloadScreenshot(shot.src, `screenshot-${index + 1}`); }} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-transform hover:scale-110" title={`下載截圖 ${index + 1}`}><Download size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="mt-auto pt-4 text-xs text-gray-400 text-center">點擊畫面中的對話框可刪除該訊息</div>
          </div>
          <button onClick={captureScreen} disabled={isCapturing} className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shrink-0">
            {isCapturing ? <><Loader2 className="animate-spin" size={20} /> 截圖處理中...</> : <><Camera size={20} /> 手動截圖</>}
          </button>
        </div>

        {/* --- Phone Preview --- */}
        <div className="relative order-2 sticky top-4 shrink-0 flex flex-col gap-4">
          <div className="w-[375px] rounded-[40px] shadow-2xl overflow-hidden border-[10px] border-gray-800 relative shrink-0 bg-gray-800 transition-all duration-300 ease-in-out" style={{ height: `${getPhoneHeight()}px` }}>
            <div ref={phoneRef} data-screenshot-target="true" className="w-full h-full bg-white relative flex flex-col">
              <div className="absolute inset-0 z-0 bg-[#F2EEE2]"></div>
              <div className="relative z-10 bg-[#F2EEE2]/90 backdrop-blur-sm pt-2 pb-1">
                <PhoneStatusBar currentTime={currentTime} />
              </div>
              <div className="relative z-10 bg-[#F2EEE2]/95 px-4 pb-3 flex items-center justify-between shadow-sm/5 border-b border-black/5">
                <div className="flex items-center gap-1 text-[#463C36] cursor-pointer flex-shrink-0"><ArrowLeft size={24} /><div className="badge-99 bg-[#D9D3C7] px-2 py-0.5 h-5 rounded-full text-[10px] font-medium text-[#6B5A4E] whitespace-nowrap font-sans flex-shrink-0 flex items-center justify-center">99+</div></div>
                <div className="font-bold text-[#463C36] text-lg truncate max-w-[180px] text-center font-sans flex-shrink-0">{chatName}</div>
                <div className="flex items-center gap-4 text-[#463C36] flex-shrink-0"><Search size={22} strokeWidth={2} /><Phone size={22} strokeWidth={2} /><Menu size={22} strokeWidth={2} /></div>
              </div>
              
              {/* Chat Scroll Area */}
              <div ref={chatAreaRef} id="chat-scroll-area" className="flex-1 relative z-10 overflow-y-auto p-4 scrollbar-hide min-h-0">
                <div ref={chatContentRef} id="chat-content-wrapper" className="flex flex-col space-y-4 min-h-full pb-4">
                  <div className="flex justify-center mb-2"><div className="date-tag bg-[#DCD6CA] text-white text-[10px] px-3 py-1 h-6 rounded-full opacity-80 whitespace-nowrap font-sans flex items-center justify-center">{getFormattedDate(chatDate)}</div></div>
                  {messages.map((msg) => (
                    <div key={msg.id} onClick={() => deleteMessage(msg.id)} className={`flex w-full ${msg.sender === 2 ? 'justify-end' : 'justify-start'} group cursor-pointer`}>
                      <div className="hidden group-hover:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded z-50 pointer-events-none">點擊刪除</div>
                      {msg.sender === 1 && (<div className="mr-2 mt-1 flex-shrink-0"><div className="w-9 h-9 rounded-full bg-gray-300 overflow-hidden border border-black/5">{user1Avatar ? <img src={user1Avatar} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[#3B5998] flex items-center justify-center text-white text-xs">A</div>}</div></div>)}
                      <div className={`flex flex-col ${msg.type === 'image' ? 'max-w-[50%]' : 'max-w-[70%]'} ${msg.sender === 2 ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-end gap-1.5 ${msg.sender === 2 ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`message-bubble relative text-[15px] break-words font-sans ${msg.type === 'image' ? 'p-0 bg-transparent shadow-none' : `px-3 py-2 shadow-sm border ${msg.sender === 1 ? 'bg-white rounded-[18px] rounded-tl-sm border-[#E6E6E6]' : 'bg-[#F0E6D2] rounded-[18px] rounded-tr-sm border-[#E8D4BB]'}`} text-[#2b2b2b]`} style={{ lineHeight: '1.5' }}>
                            {msg.type === 'image' ? <img src={msg.content} alt="sent image" className="rounded-xl max-w-full" /> : msg.content}
                          </div>
                          <div className={`flex flex-col text-[10px] text-[#8C8C8C] mb-1 whitespace-nowrap font-sans ${msg.sender === 2 ? 'items-end' : 'items-start'}`}>
                            {msg.sender === 2 && msg.read && <span className="mb-0.5 whitespace-nowrap">已讀</span>}
                            <span className="whitespace-nowrap">{msg.time}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* bottom anchor，確保 scrollIntoView 穩定 */}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="relative z-10 bg-[#F5F2EB] px-3 py-2 flex items-center gap-3 border-t border-[#E6E0D3]">
                <Plus size={24} className="text-[#4F463D]" />
                <div className="flex gap-4 text-[#4F463D]"><Camera size={22} /><ImageIcon size={22} /></div>
                <div className="flex-1 bg-white rounded-full h-9 flex items-center px-3 border border-[#E6E0D3]"><span className="text-gray-300 text-xs">Aa</span></div>
                <Smile size={24} className="text-[#4F463D]" />
                <Mic size={22} className="text-[#4F463D]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto mt-8 px-4 grid grid-cols-1 md:grid-cols-2 gap-4 pb-12">
        <AdSpace label="自適應廣告 1" className="w-full h-32 md:h-48" />
        <AdSpace label="自適應廣告 2" className="w-full h-32 md:h-48" />
      </div>

      {previewImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] w-auto h-auto">
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
            <button className="absolute -top-4 -right-4 bg-white text-black rounded-full p-1.5 hover:bg-gray-200 shadow-lg" onClick={() => setPreviewImage(null)}><X size={20} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LineChatGenerator;