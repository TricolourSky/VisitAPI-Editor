<script>
/* 拖动条自测：手动派发 mousedown/mousemove/mouseup，量拖之前/之后/重渲染之后的尺寸。
   截图看不出"拖得动"，只能这么验。 */
const log=[];
try{
  const mev=(t,x,y)=>new MouseEvent(t,{clientX:x,clientY:y,bubbles:true,cancelable:true,buttons:1});
  const pull=(el,dx,dy)=>{
    const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    el.dispatchEvent(mev("mousedown",x,y));
    window.dispatchEvent(mev("mousemove",x+dx,y+dy));
    window.dispatchEvent(mev("mouseup",x+dx,y+dy));
  };
  const W=()=>Math.round(document.getElementById("viewport").getBoundingClientRect().width);
  const H=()=>Math.round(document.querySelector(".mailpane").getBoundingClientRect().height);
  log.push("vsplit 前="+W());
  pull(document.getElementById("split"),-200,0);
  log.push("后="+W());
  log.push("hsplit 前="+H());
  pull(document.getElementById("hsplit"),0,-160);
  log.push("后="+H());
  render();
  log.push("重渲染后 宽="+W()+" 高="+H());
}catch(e){ log.push("EXCEPTION "+e.message); }
const d=document.createElement("div");d.id="PROBE";d.textContent=log.join(" | ");
document.body.appendChild(d);
</script>
