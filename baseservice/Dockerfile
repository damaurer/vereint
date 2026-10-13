# syntax=docker/dockerfile:1

# Temurin 25 (LTS-Zug seit September 2025), zusaetzlich per Digest gepinnt.
# Java 21 ist hier nicht moeglich: `baseservice/build.gradle.kts` legt die
# Toolchain auf `JavaLanguageVersion.of(25)` fest (siehe TICKET-002).
ARG JDK_IMAGE=eclipse-temurin:25-jdk
ARG JRE_IMAGE=eclipse-temurin:25-jre

# ---------- Build ----------
# Der Build laeuft nativ auf der Plattform des Runners; das Jar ist
# plattformunabhaengig und wird in das amd64- bzw. arm64-Runtime-Image kopiert.
FROM --platform=$BUILDPLATFORM ${JDK_IMAGE} AS build

WORKDIR /workspace

COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN ./gradlew dependencies --no-daemon || true

COPY src src
RUN ./gradlew bootJar --no-daemon -x test

# ---------- Runtime ----------
FROM ${JRE_IMAGE} AS runtime

WORKDIR /app

# `curl` wird ausschliesslich fuer den Healthcheck auf /api/v1/health benoetigt.
RUN apt-get update \
 && apt-get install --no-install-recommends -y curl \
 && rm -rf /var/lib/apt/lists/*

# Unprivilegierter Benutzer
RUN addgroup --system --gid 10001 vereint \
 && adduser --system --uid 10001 --ingroup vereint vereint

COPY --from=build --chown=10001:10001 /workspace/build/libs/*.jar app.jar

USER 10001:10001

ENV PORT=8081 \
    SERVER_PORT=8081

EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=40s \
  CMD curl -f http://127.0.0.1:8081/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
