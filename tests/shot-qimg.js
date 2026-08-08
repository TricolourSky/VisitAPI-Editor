<script>
(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  page="quest"; render();
  for(let i=0;i<40&&!QD;i++)await wait(100);
  await wait(300);
  document.getElementById("qimg").click();
  for(let i=0;i<40&&!QIMG;i++)await wait(100);
  await wait(200);
  if(location.hash==="#mod")document.querySelector('#gpcats [data-c="mod"]').click();
  if(location.hash==="#custom")document.querySelector('#gpcats [data-c="custom"]').click();
  await wait(500);
})();
</script>
