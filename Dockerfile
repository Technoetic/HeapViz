FROM nginx:alpine
COPY web/dist/index.html /usr/share/nginx/html/index.html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE ${PORT:-80}
CMD ["nginx", "-g", "daemon off;"]
