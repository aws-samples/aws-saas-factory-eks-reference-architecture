FROM maven:3.6.3-amazoncorretto-11 as BUILD

#ADD m2.tar.gz /root

COPY . /usr/src/product-service
RUN mvn -Dmaven.repo.local=/root/m2 --batch-mode -f /usr/src/product-service/pom.xml clean package

FROM openjdk:11-jdk-slim
EXPOSE 80
COPY --from=BUILD /usr/src/product-service/target /opt/target
WORKDIR /opt/target

CMD ["java", "-jar", "product-service.war"]
