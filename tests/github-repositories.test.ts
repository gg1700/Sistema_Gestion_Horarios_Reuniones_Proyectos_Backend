import { describe, expect, it } from "vitest";
import { fetchGithubRepositories, validateRepositorySelection } from "../src/services/github-repository.service";
import { createGithubClient, githubRequestError } from "../src/services/github-client.service";
import type { GithubRepositoryAccount } from "../src/types/github-repository.types";
import type { Octokit } from "octokit";

const account = { provider_user_id: '42', scopes: 'read:user,user:email' } as GithubRepositoryAccount;
const repo = (id: number, overrides = {}) => ({ id, name: `repo-${id}`, description: null, language: null, stargazers_count: 3, html_url: `https://github.com/ana/repo-${id}`, private:false, owner:{id:42}, ...overrides });
function client(pages: unknown[][], scopes = '', parameters: unknown[] = []) {
  return {
    request: async () => ({ data: { id:42, login:'ana' }, headers:{'x-oauth-scopes':scopes} }),
    paginate:{ iterator: (_route: string, params: unknown) => {
      parameters.push(params);
      return (async function* () { for (const data of pages) yield {data}; })();
    } },
  } as unknown as Octokit;
}
describe('T-43 repositorios de GitHub', () => {
  it('reutiliza Octokit real y sigue Link hasta agotar las páginas', async () => {
    const octokit = await createGithubClient('test-only');
    const calls: string[] = [];
    octokit.request = octokit.request.defaults({ request: { fetch: async (input: any) => {
      const url = String(input); calls.push(url);
      const user = new URL(url).pathname === '/user';
      const second = new URL(url).searchParams.get('page') === '2';
      return new Response(JSON.stringify(user ? {id:42,login:'ana'} : [repo(second ? 2 : 1)]), {
        status:200, headers:{ 'Content-Type':'application/json', 'x-oauth-scopes':'',
          ...(!user && !second ? {link:'<https://api.github.com/user/repos?page=2>; rel="next"'} : {}) },
      });
    } } });
    expect((await fetchGithubRepositories(octokit, account)).repositories.map(item=>item.id)).toEqual([1,2]);
    expect(calls).toHaveLength(3);
  });
  it('admite una cuenta sin repositorios', async () => {
    expect((await fetchGithubRepositories(client([[]]), account)).repositories).toEqual([]);
  });
  it('recorre todas las páginas, conserva orden pushed y normaliza nulos', async () => {
    const params: any[] = [];
    const result = await fetchGithubRepositories(client([[repo(3)], [repo(2),repo(1)]], '', params), account);
    expect(result.repositories.map(item => item.id)).toEqual([3,2,1]);
    expect(result.repositories[0]).toMatchObject({ description:null, language:null, stars:3, visibility:'public', private:false });
    expect(params[0]).toMatchObject({sort:'pushed', direction:'desc', per_page:100, affiliation:'owner', visibility:'public'});
  });
  it('no devuelve privados con token público, aunque GitHub los incluya', async () => {
    const result = await fetchGithubRepositories(client([[repo(1),repo(2,{private:true})]]), {...account,scopes:'repo'});
    expect(result.repositories.map(item => item.id)).toEqual([1]);
  });
  it('devuelve privados marcados solo con scope repo y excluye repositorios ajenos', async () => {
    const result = await fetchGithubRepositories(client([[repo(1),repo(2,{private:true}),repo(3,{owner:{id:99}})]], 'repo'), account);
    expect(result.repositories).toHaveLength(2);
    expect(result.repositories[1]).toMatchObject({private:true,visibility:'private'});
  });
  it('rechaza una identidad distinta de la cuenta vinculada', async () => {
    await expect(fetchGithubRepositories(client([[]]), {...account,provider_user_id:'99'})).rejects.toMatchObject({code:'GITHUB_REAUTH_REQUIRED'});
  });
  it('normaliza límites primarios, secundarios, permisos y caducidad', () => {
    expect(githubRequestError({status:403,response:{headers:{'x-ratelimit-remaining':'0'}}})).toMatchObject({statusCode:429,retryAfter:60});
    expect(githubRequestError({status:403,response:{headers:{'retry-after':'15'}}})).toMatchObject({statusCode:429,retryAfter:15});
    expect(githubRequestError({status:403})).toMatchObject({statusCode:403});
    expect(githubRequestError({status:401})).toMatchObject({code:'GITHUB_REAUTH_REQUIRED'});
    expect(githubRequestError(new Error('network'))).toMatchObject({statusCode:502});
  });
  it.each([{}, null, {repositoryIds:[1,1]}, {repositoryIds:[1,2,3,4,5,6]}, {repositoryIds:['1']}, {repositoryIds:[-1]}, {repositoryIds:[1.1]}])('rechaza una selección inválida %j', body => {
    expect(() => validateRepositorySelection(body)).toThrow();
  });
  it('acepta vaciar y reordenar por el orden del array', () => {
    expect(validateRepositorySelection({repositoryIds:[]})).toEqual([]);
    expect(validateRepositorySelection({repositoryIds:[3,1]})).toEqual([3,1]);
  });
});
