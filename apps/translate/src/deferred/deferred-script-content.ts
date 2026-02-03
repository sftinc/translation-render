/**
 * Minified Deferred Translation Script Content
 * This is the actual script served to clients via /__pantolingo/deferred.js
 *
 * Source: deferred-script.ts (for documentation/reference)
 *
 * Features:
 * - Polls for translations of pending segments
 * - Applies completed translations from /__pantolingo/translate endpoint
 * - Removes skeleton styling on completion
 * - Falls back to original English after 10 polls
 */

export const DEFERRED_SCRIPT = `(function(){
var p=window.__PANTOLINGO_DEFERRED__;
if(!p||!p.length)return;
var DELAY=1000,INT=1000,MAX=10;
function apply(h,t,k,a){
if(k==='html'){var e=document.querySelector('[data-pantolingo-pending="'+h+'"]');if(e){e.innerHTML=t;e.classList.remove('pantolingo-skeleton');e.removeAttribute('data-pantolingo-pending');return true}}
else if(k==='text'){
var w=document.createTreeWalker(document.body,128,{acceptNode:function(n){return n.data==='pantolingo:'+h?1:3}});
var c=w.nextNode();
if(c){var tn=c.nextSibling;if(tn&&tn.nodeType===3){var o=tn.data,l=o.match(/^(\\s*)/)[1]||'',r=o.match(/(\\s*)$/)[1]||'';tn.data=l+t+r;var pe=tn.parentElement;if(pe&&pe.classList.contains('pantolingo-skeleton')){pe.classList.remove('pantolingo-skeleton');pe.removeAttribute('data-pantolingo-pending')}c.remove();return true}}
var ti=document.querySelector('title[data-pantolingo-pending="'+h+'"]');if(ti){ti.textContent=t;ti.removeAttribute('data-pantolingo-pending');return true}
}else if(k==='attr'&&a){var e=document.querySelector('[data-pantolingo-pending="'+h+'"][data-pantolingo-attr="'+a+'"]');if(e){e.setAttribute(a,t);e.removeAttribute('data-pantolingo-pending');e.removeAttribute('data-pantolingo-attr');return true}}
return false
}
function show(s){
var h=s.hash,k=s.kind,a=s.attr;
if(k==='html'){var e=document.querySelector('[data-pantolingo-pending="'+h+'"]');if(e){e.classList.remove('pantolingo-skeleton');e.removeAttribute('data-pantolingo-pending')}}
else if(k==='text'){
var w=document.createTreeWalker(document.body,128,{acceptNode:function(n){return n.data==='pantolingo:'+h?1:3}});
var c=w.nextNode();if(c){var pe=c.parentElement;if(pe&&pe.classList.contains('pantolingo-skeleton')){pe.classList.remove('pantolingo-skeleton');pe.removeAttribute('data-pantolingo-pending')}c.remove()}
var ti=document.querySelector('title[data-pantolingo-pending="'+h+'"]');if(ti)ti.removeAttribute('data-pantolingo-pending')
}else if(k==='attr'&&a){var e=document.querySelector('[data-pantolingo-pending="'+h+'"][data-pantolingo-attr="'+a+'"]');if(e){e.removeAttribute('data-pantolingo-pending');e.removeAttribute('data-pantolingo-attr')}}
}
function poll(pend,cnt){
if(!pend.length||cnt>=MAX){for(var i=0;i<pend.length;i++)show(pend[i]);return}
var body={segments:pend.map(function(s){var o={hash:s.hash,kind:s.kind,content:s.content};if(s.attr)o.attr=s.attr;return o})};
fetch('/__pantolingo/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(ts){
var still=[];
for(var i=0;i<pend.length;i++){var s=pend[i];if(ts[s.hash]!==undefined)apply(s.hash,ts[s.hash],s.kind,s.attr);else still.push(s)}
if(still.length)setTimeout(function(){poll(still,cnt+1)},INT)
}).catch(function(e){console.error('[Pantolingo] Polling error:',e);setTimeout(function(){poll(pend,cnt+1)},INT)})
}
function init(){setTimeout(function(){poll(p.slice(),0)},DELAY)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();`
