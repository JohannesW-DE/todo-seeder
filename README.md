# Nutzung

0. ```npm install```
1. Daten in .env anpassen
2. Seeden der MariaDB: ```npm run mariadb```
3. Auf dem Seeding basierend ggf. die anderen Datenbanken befüllen
  - ```npm run mongodb``` (ggf. die DB und die user-Collection manuell anlegen)
  - ```npm run neo4j```
4. Benchmarken (bisher nur mal ganz rudimentär nur für MariaDB und nur mit einem (immerhin rekursiven!) Query eingebaut)
  - ```npm run mariadb:benchmark```

Viel Spass beim Rumprobieren!

p.s.: 

Für MariaDB (kann sein dass ich da vorher das offizielle Image erst installiert habe, nicht mehr ganz sicher wie und was ich da in welcher Reihenfolge gemacht habe, aber das Ende war glaube ich der folgende Aufruf):

```docker run --name=mariadb -e MYSQL_ROOT_PASSWORD=123 -e MYSQL_DATABASE=todo -p 3306:3306 -d mariadb```


Für das Nutzen der NoSQL Datenbanken habe ich mich an "Einrichtung_der_NoSQL-DBen.pdf" von e-Learning Modul gehalten
