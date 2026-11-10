FROM python:3.12-alpine

WORKDIR /srv/website
COPY . .

EXPOSE 5174

CMD ["python3", "-m", "http.server", "5174", "--bind", "0.0.0.0"]
