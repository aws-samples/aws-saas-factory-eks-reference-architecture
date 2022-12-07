FROM public.ecr.aws/docker/library/maven:3.8.6-amazoncorretto-11 as BUILD

#ADD m2.tar.gz /root

COPY . /usr/src/tenant-management-service
RUN mvn -Dmaven.repo.local=/root/m2 --batch-mode -f /usr/src/tenant-management-service/pom.xml clean package

FROM public.ecr.aws/docker/library/openjdk:11.0-slim
EXPOSE 80
COPY --from=BUILD /usr/src/tenant-management-service/target /opt/target
WORKDIR /opt/target

CMD ["java", "-jar", "tenant-management-service.war"]

