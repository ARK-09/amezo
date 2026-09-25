# Build context is backend/, not the repo root - the frontend deploys separately
# (Vercel) and has no business in this image's context.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# pom first so the dependency download layer survives source-only changes.
# Tolerated failing: go-offline chokes on some plugin/profile combinations, and
# anything it misses is fetched again by the package step below, so a miss here
# costs cache, not correctness.
COPY pom.xml .
RUN mvn -B -ntp dependency:go-offline || true

COPY src ./src
# Tests are Testcontainers-backed (a real Postgres per class) and there is no
# Docker daemon inside an image build - the suite runs in CI/locally, not here.
RUN mvn -B -ntp clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# Unprivileged: nothing in this service writes to disk (images go to S3), so the
# runtime needs no ownership beyond reading the jar.
RUN addgroup -S app && adduser -S -G app app
COPY --from=build /build/target/*.jar app.jar
USER app

# Tuned for the ~512 MB / fractional-CPU free container the deploy guide targets:
# MaxRAMPercentage keeps the heap inside the container limit (the JVM would
# otherwise size it off the host's RAM and get OOM-killed), SerialGC drops the
# per-CPU GC thread overhead that G1 pays for on a fraction of a core, and the
# smaller thread stacks matter once Tomcat opens 200 of them. Override with
# JAVA_OPTS for a bigger plan.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080
# Shell form so $JAVA_OPTS/$PORT expand, exec so java is PID 1 and gets SIGTERM
# directly (hosts kill the container on redeploy and only wait ~30s).
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
