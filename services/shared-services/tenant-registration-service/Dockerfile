FROM maven:3.6.1-amazoncorretto-8 as BUILD

#ADD m2.tar.gz /root

COPY . /usr/src/tenant-registration-service
RUN mvn -Dmaven.repo.local=/root/m2 --batch-mode -f /usr/src/tenant-registration-service/pom.xml clean package

FROM openjdk:8-jre-slim
EXPOSE 80
COPY --from=BUILD /usr/src/tenant-registration-service/target /opt/target
WORKDIR /opt/target
ENV _JAVA_OPTIONS '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=5005'

CMD ["java", "-jar", "tenant-registration-service.war"]

