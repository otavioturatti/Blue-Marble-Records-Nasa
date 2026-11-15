# Blue Marble Records: the static app in web/, served by nginx.
# Easypanel (or any Docker host) builds this file and exposes port 80.
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/
EXPOSE 80
