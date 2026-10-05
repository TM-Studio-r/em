import { supabase } from "./supabase.js";
import { newIdentity, avatarLetter } from "./crypto.js";
import { VAPID_PUBLIC_KEY } from "../config.js";

const $=id=>document.getElementById(id);
const state={user:null,profile:null,currentChat:"main",profiles:new Map(),messages:new Map(),channel:null};

function toast(t){const e=$("toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2400)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function time(v){return new Intl.DateTimeFormat("fa-IR",{hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
function urlBase64ToUint8Array(base64String){const padding="=".repeat((4-base64String.length%4)%4);const raw=atob((base64String+padding).replaceAll("-","+").replaceAll("_","/"));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
async function enablePush(){if(!("serviceWorker"in navigator)||!("PushManager"in window)||!window.isSecureContext)return;if(!VAPID_PUBLIC_KEY||VAPID_PUBLIC_KEY.startsWith("PASTE_"))return;const reg=await navigator.serviceWorker.ready;let permission=Notification.permission;if(permission==="default")permission=await Notification.requestPermission();if(permission!=="granted")return;let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});const j=sub.toJSON();if(!j.endpoint||!j.keys?.p256dh||!j.keys?.auth)return;const {error}=await supabase.from("push_subscriptions").upsert({user_id:state.user.id,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()},{onConflict:"endpoint"});if(error)console.warn("push subscription save failed",error);}
function showMessenger(){ $("loginView").classList.add("hidden"); $("messengerView").classList.remove("hidden"); }
async function ensureProfile(){
  const {data:{session}}=await supabase.auth.getSession();
  state.user=session?.user || null;
  if(!state.user)return false;
  const {data:p,error}=await supabase.from("profiles").select("*").eq("id",state.user.id).maybeSingle();
  if(error) throw error;
  state.profile=p;
  return !!p;
}
async function login(name,bio){
  $("loginStatus").textContent="در حال ورود...";
  const {data,error}=await supabase.auth.signInAnonymously();
  if(error) throw error;
  state.user=data.user;
  const identity=await newIdentity();
  const {error:e}=await supabase.from("profiles").upsert({
    id:state.user.id,display_name:name.trim(),bio:(bio||"").trim(),public_key:identity.publicKey
  });
  if(e)throw e;
  localStorage.setItem("tm_identity:"+state.user.id,JSON.stringify(identity));
  await joinMainGroup(name.trim());
  await ensureProfile();
  showMessenger(); await enablePush().catch(console.warn); await loadChats(); await openChat("main"); subscribe();
  $("loginStatus").textContent="";
}
async function joinMainGroup(name){
  const {data:existing}=await supabase.from("conversation_members").select("chat_id").eq("chat_id","00000000-0000-0000-0000-000000000001").eq("user_id",state.user.id).maybeSingle();
  if(!existing){
    await supabase.from("conversation_members").insert({chat_id:"00000000-0000-0000-0000-000000000001",user_id:state.user.id});
    await supabase.from("messages").insert({chat_id:"00000000-0000-0000-0000-000000000001",sender_id:null,ciphertext:JSON.stringify({system:true,text:`${name} به گروه پیوست`}),message_type:"system"});
  }
}
async function loadChats(){
  const {data:members}=await supabase.from("conversation_members").select("chat_id, conversations(*)").eq("user_id",state.user.id);
  const ids=(members||[]).map(x=>x.conversations).filter(Boolean);
  $("chatList").innerHTML=ids.map(c=>`<button class="chat-item ${c.id===state.currentChat?"active":""}" data-chat="${c.id}">
    <div class="avatar">${c.type==="group"?"👥":"?"}</div><div class="preview"><h4>${esc(c.title||"چت")}</h4><p>${c.type==="group"?"گروه اصلی":"گفت‌وگوی خصوصی"}</p></div></button>`).join("");
  $("chatList").querySelectorAll("[data-chat]").forEach(b=>b.onclick=()=>openChat(b.dataset.chat));
}
async function getProfiles(ids){
  const missing=ids.filter(id=>!state.profiles.has(id));
  if(!missing.length)return;
  const {data}=await supabase.from("profiles").select("id,display_name,bio,public_key").in("id",missing);
  (data||[]).forEach(p=>state.profiles.set(p.id,p));
}
async function openChat(id){
  state.currentChat=id; $("messengerView").classList.add("mobile-chat");
  const {data:c}=await supabase.from("conversations").select("*").eq("id",id).single();
  $("chatTitle").textContent=c?.title||"گفت‌وگو"; $("chatSubtitle").textContent=c?.type==="group"?"گروه اصلی":"گفت‌وگوی خصوصی";
  const {data:rows,error}=await supabase.from("messages").select("*").eq("chat_id",id).order("created_at",{ascending:true}).limit(200);
  if(error){toast(error.message);return}
  const ids=(rows||[]).map(x=>x.sender_id).filter(Boolean); await getProfiles(ids);
  $("messages").innerHTML=(rows||[]).map(renderMessage).join(""); $("messages").scrollTop=$("messages").scrollHeight;
  await loadChats();
}
function renderMessage(m){
  if(m.message_type==="system"){let x;try{x=JSON.parse(m.ciphertext)}catch{}return `<div class="day-label">${esc(x?.text||"پیام سیستمی")}</div>`}
  const p=state.profiles.get(m.sender_id), mine=m.sender_id===state.user.id;
  let text="[پیام رمزنگاری‌شده]";
  try{const x=JSON.parse(m.ciphertext);if(x.preview)text=x.preview}catch{}
  return `<div class="msg-row ${mine?"mine":"other"}">
    <button class="avatar" data-profile="${m.sender_id}">${esc(avatarLetter(p?.display_name))}</button>
    <div><div class="msg-author">${esc(p?.display_name||"کاربر")}</div><div class="bubble">${esc(text)}<span class="bubble-meta">${time(m.created_at)}</span></div></div>
  </div>`;
}
function subscribe(){
  if(state.channel)supabase.removeChannel(state.channel);
  state.channel=supabase.channel("messages-live").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},async payload=>{
    if(payload.new.chat_id!==state.currentChat)return;
    if(payload.new.sender_id)await getProfiles([payload.new.sender_id]);
    const box=$("messages");box.insertAdjacentHTML("beforeend",renderMessage(payload.new));box.scrollTop=box.scrollHeight;
  }).subscribe();
}
async function sendMessage(text){
  const {data:c}=await supabase.from("conversations").select("type").eq("id",state.currentChat).single();
  // v1 stores an encrypted envelope placeholder. Full multi-recipient group key distribution
  // is intentionally blocked until the device identity exists for every member.
  const ciphertext=JSON.stringify({v:1,preview:text});
  const {error}=await supabase.from("messages").insert({chat_id:state.currentChat,sender_id:state.user.id,ciphertext,message_type:"text"});
  if(error)throw error;
}
$("profileForm").onsubmit=async e=>{e.preventDefault();try{await login($("nameInput").value,$("bioInput").value)}catch(err){$("loginStatus").textContent=err.message||"ورود ناموفق بود";console.error(err)}};
$("composer").onsubmit=async e=>{e.preventDefault();const i=$("messageInput"),t=i.value.trim();if(!t)return;try{await sendMessage(t);i.value="";i.style.height="auto"}catch(err){toast("ارسال ناموفق بود");console.error(err)}};
$("messageInput").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,130)+"px"});
$("backBtn").onclick=()=>$("messengerView").classList.remove("mobile-chat");
$("myProfileBtn").onclick=async()=>{await ensureProfile();showProfile(state.profile)};
$("chatInfoBtn").onclick=()=>{$("infoContent").innerHTML="<h2>گروه اصلی</h2><p class='muted'>هر عضو جدید به‌صورت خودکار عضو گروه می‌شود.</p>";$("infoDialog").showModal()};
document.addEventListener("click",async e=>{const b=e.target.closest("[data-profile]");if(!b)return;const p=state.profiles.get(b.dataset.profile);if(p)showProfile(p)});
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>x.closest("dialog").close());
function showProfile(p){$("profileContent").innerHTML=`<div class="profile-card"><div class="big-avatar">${esc(avatarLetter(p.display_name))}</div><h2>${esc(p.display_name)}</h2><div class="bio">${esc(p.bio||"بیویی ثبت نشده.")}</div></div>`;$("profileDialog").showModal()}
(async()=>{
  if("serviceWorker" in navigator) try{await navigator.serviceWorker.register("./sw.js",{scope:"./"})}catch(e){console.warn("SW",e)}
  try{
    if(await ensureProfile()){showMessenger();await enablePush().catch(console.warn);await loadChats();const requested=new URLSearchParams(location.search).get("chat");await openChat(requested||"main");subscribe()}
  }catch(e){console.warn(e)}
})();
