# Nutzung

1. Daten in .env anpassen
2. Seeden der MariaDB;: ```npm run mariadb```
3. Auf dem Seeding basierend ggf. die anderen Datenbanken populaten
  - ```npm run mongodb``` (ggf. die DB und die user-Collection manuell anlegen)
  - ```npm run neo4j```
4. Benchmarken (bisher nur mal ganz rudimentär nur für MariaDB und nur mit einem (immerhin rekursiven!) Query eingebaut)
  - ```npm run mariadb:benchmark```

Viel Spass beim Rumprobieren!