<script>
(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  page="about"; render();
  for(let i=0;i<40&&!ABENV;i++)await wait(100);
  await wait(300);
  if(location.hash==="#en"){lang="en";applyStatic();render();}
  if(location.hash==="#light"){setTheme("light");render();}
  await wait(200);
  document.title="SHOT-READY";
})();
</script>
