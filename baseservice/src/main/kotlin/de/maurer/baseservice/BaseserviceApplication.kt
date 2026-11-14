package de.maurer.baseservice

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class BaseserviceApplication

fun main(args: Array<String>) {
  runApplication<BaseserviceApplication>(*args)
}
