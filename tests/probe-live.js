<script>
/* 心跳的真浏览器验收用这一个探针：把"页面认为后台还在不在"写进标题。
   标题能通过 DevTools 的 /json/list 用纯 HTTP 读到（那是浏览器的接口，不是我们的），
   所以**服务端被杀之后照样读得到** —— 这正是要验的场景。 */
setInterval(()=>{ document.title = document.querySelector(".deadwrap") ? "DEAD" : "LIVE"; }, 200);
</script>
