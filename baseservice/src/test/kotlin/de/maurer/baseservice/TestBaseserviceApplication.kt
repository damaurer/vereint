package de.maurer.baseservice

import org.springframework.boot.fromApplication
import org.springframework.boot.with


fun main(args: Array<String>) {
  fromApplication<BaseserviceApplication>().with(TestcontainersConfiguration::class).run(*args)
}
