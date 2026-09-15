@echo off
cd C:\Users\NGFEP\Downloads\project
mkdir C:\temp 2>nul
tar czf C:\temp\csat-deploy.tar.gz --exclude=.git --exclude=node_modules --exclude=.next --exclude='.env*' --exclude=.deploy-credentials.local --exclude=logs --exclude=public_html -C C:\Users\NGFEP\Downloads\project . 2>&1
if exist C:\temp\csat-deploy.tar.gz (echo FILE EXISTS) else (echo FILE NOT FOUND)
pscp -batch -pw "?Arc3l0rP@n3l@20255#" C:\temp\csat-deploy.tar.gz root@92.112.194.251:/tmp/ 2>&1
plink -ssh -batch -pw "?Arc3l0rP@n3l@20255#" root@92.112.194.251 "cd /home/csat.iwn.ng && tar xzf /tmp/csat-deploy.tar.gz && rm /tmp/csat-deploy.tar.gz" 2>&1
plink -ssh -batch -pw "?Arc3l0rP@n3l@20255#" root@92.112.194.251 "cd /home/csat.iwn.ng && npm install --no-audit --no-fund && npx prisma generate" 2>&1
plink -ssh -batch -pw "?Arc3l0rP@n3l@20255#" root@92.112.194.251 "cd /home/csat.iwn.ng && npm run build" 2>&1
plink -ssh -batch -pw "?Arc3l0rP@n3l@20255#" root@92.112.194.251 "pm2 restart csat --update-env && pm2 save; sleep 4; curl -s -o /dev/null -w 'health: %{http_code}\n' https://csat.iwn.ng/api/health; curl -s -o /dev/null -w 'site: %{http_code}\n' https://csat.iwn.ng/; pm2 ls | grep csat" 2>&1