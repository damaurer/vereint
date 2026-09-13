package de.maurer.baseservice

import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
class HealthControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `health endpoint returns UP without authentication`() {
        mockMvc.perform(get("/api/v1/health"))
            .andExpect(status().isOk)
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.service").value("vereint-baseservice"))
            .andExpect(jsonPath("$.version").value("v1"))
            .andExpect(jsonPath("$.buildVersion").exists())
            .andExpect(jsonPath("$.timestamp").exists())
    }

    @Test
    fun `actuator health endpoint is publicly accessible without component details`() {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.components").doesNotExist())
            .andExpect(jsonPath("$.details").doesNotExist())
    }

    @Test
    fun `liveness and readiness probes stay open for container healthchecks`() {
        mockMvc.perform(get("/actuator/health/liveness"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("UP"))

        mockMvc.perform(get("/actuator/health/readiness"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("UP"))
    }

    @Test
    fun `api info endpoint returns v1 metadata and the build version`() {
        mockMvc.perform(get("/api/v1/info"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version").value("v1"))
            .andExpect(jsonPath("$.service").value("vereint-baseservice"))
            .andExpect(jsonPath("$.buildVersion").exists())
    }
}
