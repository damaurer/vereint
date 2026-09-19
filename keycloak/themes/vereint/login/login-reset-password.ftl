<#--
  Vereint Login-Theme: Passwort zuruecksetzen.
  Basis: keycloak.v2/login/login-reset-password.ftl aus Keycloak 26.1.4.
  Aenderungen: Eyebrow/Untertitel statt Info-Block, eigener Button-Text
  (vereintResetSubmit); Variablen und Aktionen unveraendert.
-->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayInfo=false displayMessage=!messagesPerField.existsError('username'); section>
    <#if section = "eyebrow">
        ${msg("vereintEyebrow")}
    <#elseif section = "header">
        ${msg("emailForgotTitle")}
    <#elseif section = "form">
        <div class="vereint-form">
            <p class="vereint-subtitle">
                <#if realm.duplicateEmailsAllowed>
                    ${msg("emailInstructionUsername")}
                <#else>
                    ${msg("vereintResetSubtitle")}
                </#if>
            </p>
            <form id="kc-reset-password-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
                <#assign label>
                    <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                </#assign>
                <@field.input name="username" label=label value=auth.attemptedUsername!'' autofocus=true autocomplete="username" />

                <@buttons.actionGroup>
                  <@buttons.button id="kc-form-buttons" label="vereintResetSubmit" class=["kcButtonPrimaryClass", "kcButtonBlockClass"]/>
                  <@buttons.buttonLink href=url.loginUrl label="backToLogin" class=["kcButtonSecondaryClass", "kcButtonBlockClass"]/>
                </@buttons.actionGroup>
            </form>
        </div>
    </#if>
</@layout.registrationLayout>
