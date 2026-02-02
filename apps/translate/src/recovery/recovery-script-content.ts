/**
 * Minified Recovery Script Content
 * This is the actual script served to clients via /__pantolingo/recovery.js
 *
 * Source: recovery-script.ts (for documentation/reference)
 *
 * Features:
 * - Applies translations from window.__PANTOLINGO__ dictionary
 * - Handles HTML block translations (innerHTML replacement)
 * - Handles text node translations (preserves whitespace)
 * - Handles attribute translations (alt, title, placeholder, aria-label)
 * - MutationObserver for React/Next.js hydration changes
 * - Auto-disconnects observer after 2 seconds
 * - Adds .pantolingo-ready class to body when complete
 */

export const RECOVERY_SCRIPT = `(function(){
var d=window.__PANTOLINGO__;
if(!d)return;
var ATTRS=['alt','title','placeholder','aria-label'];
var BLOCKS=['P','H1','H2','H3','H4','H5','H6','LI','TD','TH','DD','DT','FIGCAPTION','CAPTION','LABEL','LEGEND','SUMMARY'];
function skip(e){while(e){if(e.hasAttribute&&(e.hasAttribute('data-pantolingo-skip')||e.hasAttribute('data-pantolingo-pending')))return true;e=e.parentElement}return false}
function ws(s){return[s.match(/^(\\s*)/)[1]||'',s.match(/(\\s*)$/)[1]||'']}
function html(p){
var h=d.html;if(!Object.keys(h).length)return;
var w=document.createTreeWalker(document.body,1,{acceptNode:function(n){if(skip(n))return 2;if(BLOCKS.indexOf(n.tagName)>-1)return 1;return 3}});
var n;while(n=w.nextNode()){var t=n.textContent;if(t){t=t.trim();if(h[t]){n.innerHTML=h[t];p.add(n)}}}
}
function text(p){
var t=d.text;if(!Object.keys(t).length)return;
var w=document.createTreeWalker(document.body,4,{acceptNode:function(n){var e=n.parentElement;while(e){if(p.has(e)||skip(e))return 2;e=e.parentElement}if(n.data.trim().length>0)return 1;return 3}});
var n;while(n=w.nextNode()){var s=n.data,tr=s.trim();if(t[tr]){var w2=ws(s);n.data=w2[0]+t[tr]+w2[1]}}
}
function attr(){
var a=d.attrs;if(!Object.keys(a).length)return;
var sel=ATTRS.map(function(x){return'['+x+']'}).join(',');
var els=document.body.querySelectorAll(sel);
for(var i=0;i<els.length;i++){var e=els[i];if(skip(e))continue;for(var j=0;j<ATTRS.length;j++){var v=e.getAttribute(ATTRS[j]);if(v&&a[v])e.setAttribute(ATTRS[j],a[v])}}
}
function recover(){var p=new Set();html(p);text(p);attr();document.body.classList.add('pantolingo-ready')}
function mut(ms){
var p=new Set();
for(var i=0;i<ms.length;i++){var m=ms[i];
if(m.type==='childList'){for(var j=0;j<m.addedNodes.length;j++){var n=m.addedNodes[j];if(n.nodeType===1){html(p);text(p);attr()}else if(n.nodeType===3){var s=n.data,tr=s.trim();if(tr&&d.text[tr]){var w2=ws(s);n.data=w2[0]+d.text[tr]+w2[1]}}}}
else if(m.type==='characterData'){var n=m.target,s=n.data,tr=s.trim();if(tr&&d.text[tr]){var w2=ws(s);n.data=w2[0]+d.text[tr]+w2[1]}}}
}
function init(){
recover();
var ob=new MutationObserver(mut);
ob.observe(document.body,{childList:true,subtree:true,characterData:true});
setTimeout(function(){ob.disconnect()},2000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();`
