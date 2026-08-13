import{c as d}from"./createLucideIcon-BDdWa_dV.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=d("ClipboardList",[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1",key:"tgr4d6"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",key:"116196"}],["path",{d:"M12 11h4",key:"1jrz19"}],["path",{d:"M12 16h4",key:"n85exb"}],["path",{d:"M8 11h.01",key:"1dfujw"}],["path",{d:"M8 16h.01",key:"18s6g9"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=d("TriangleAlert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]),i=t=>{const n=t.getFullYear(),e=String(t.getMonth()+1).padStart(2,"0"),o=String(t.getDate()).padStart(2,"0");return`${n}-${e}-${o}`},c=t=>new Date(t.getFullYear(),t.getMonth(),t.getDate()),y=t=>new Date(t).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}),g=(t,n=new Date)=>{const e=new Date(t),o=c(n),a=c(e),r=Math.round((o.getTime()-a.getTime())/864e5);return r===0?"Сегодня":r===1?"Вчера":e.toLocaleDateString("ru-RU",{day:"numeric",month:"long"})},l=(t,n=new Date)=>{const e=new Map,o=[...t].sort((a,r)=>new Date(r.createdAt).getTime()-new Date(a.createdAt).getTime());for(const a of o){const r=i(new Date(a.createdAt)),s=e.get(r)??{key:r,label:g(a.createdAt,n),orders:[]};s.orders.push(a),e.set(r,s)}return[...e.values()]};export{u as C,p as T,y as f,l as g};
