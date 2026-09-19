<#--
  Vereint Login-Theme: Anmeldeseite.
  Basis: keycloak.v2/login/login.ftl aus Keycloak 26.1.4.
  Aenderungen: Eyebrow/Untertitel, "Angemeldet bleiben" und "Passwort vergessen?"
  als gemeinsame Zeile (.vereint-form-row); alle Keycloak-Variablen unveraendert.
-->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<#import "social-providers.ftl" as identityProviders>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "eyebrow">
        ${msg("vereintEyebrow")}
    <#elseif section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <div id="kc-form" class="vereint-form">
          <div id="kc-form-wrapper">
            <p class="vereint-subtitle">${msg("vereintLoginSubtitle")}</p>
            <#if realm.password>
                <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" novalidate="novalidate">
                    <#if !usernameHidden??>
                        <#assign label>
                            <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                        </#assign>
                        <@field.input name="username" label=label error=kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc autofocus=true autocomplete="username" value=login.username!'' />
                        <@field.password name="password" label=msg("password") error="" forgotPassword=false autofocus=usernameHidden?? autocomplete="current-password" />
                    <#else>
                        <@field.password name="password" label=msg("password") forgotPassword=false autofocus=usernameHidden?? autocomplete="current-password" />
                    </#if>

                    <#if (realm.rememberMe && !usernameHidden??) || realm.resetPasswordAllowed>
                    <div class="${properties.kcFormGroupClass!} vereint-form-row">
                        <#if realm.rememberMe && !usernameHidden??>
                            <@field.checkbox name="rememberMe" label=msg("rememberMe") value=login.rememberMe?? />
                        </#if>
                        <#if realm.resetPasswordAllowed>
                            <a class="vereint-forgot" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                        </#if>
                    </div>
                    </#if>

                    <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                    <@buttons.loginButton />
                </form>
            </#if>
            </div>
        </div>
    <#elseif section = "info" >
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container" class="${properties.kcLoginFooterBand!}">
                <div id="kc-registration" class="${properties.kcLoginFooterBandItem!}">
                    <span>${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></span>
                </div>
            </div>
        </#if>
    <#elseif section = "socialProviders" >
        <#if realm.password && social.providers?? && social.providers?has_content>
            <@identityProviders.show social=social/>
        </#if>
    </#if>

</@layout.registrationLayout>
